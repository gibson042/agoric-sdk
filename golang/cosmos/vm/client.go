package vm

import (
	"context"
	"fmt"
	"net/rpc"
	"sync"
)

// ReceiveMessageMethod is the name of the method we call in order to have the
// VM receive a Message.
const ReceiveMessageMethod = "agvm.ReceiveMessage"

// Message is what we send to the VM.
type Message struct {
	Port       int
	Data       string
	NeedsReply bool
}

// ClientCodec implements rpc.ClientCodec.
var _ rpc.ClientCodec = (*ClientCodec)(nil)

// ClientCodec implements a net/rpc ClientCodec for the "bridge" between the Go
// runtime and the VM in the single-process dual-runtime configuration.
//
// We expect to call it via the legacy API with signature:
//
//	sendToController func(needsReply bool, msg string) (string, error)
//
// where msg and the returned string are JSON-encoded values.
//
// Note that the net/rpc framework cannot express a call that does not expect a
// response, so we'll note such calls by sending with a reply port of 0 and
// having the WriteRequest() method fabricate a Receive() call to clear the rpc
// state.
type ClientCodec struct {
	ctx     context.Context
	send    func(port, rPort int, msg string)
	inbound chan *rpc.Response

	// reqMutex protects outbound requests.
	reqMutex sync.Mutex
	outbound map[int]rpc.Request

	// Scratch space to communicate between ReadResponseHeader and
	// ReadResponseBody (protected by mutex in "net/rpc" implementation).
	replyToRead uint64

	// mutex protects replies map
	mutex   sync.Mutex
	replies map[uint64]string
}

// NewClientCodec creates a new ClientCodec.
func NewClientCodec(ctx context.Context, send func(int, int, string)) *ClientCodec {
	return &ClientCodec{
		ctx:      ctx,
		send:     send,
		outbound: make(map[int]rpc.Request),
		inbound:  make(chan *rpc.Response),
		replies:  make(map[uint64]string),
	}
}

// WriteRequest sends a request to the VM.
func (cc *ClientCodec) WriteRequest(r *rpc.Request, body interface{}) error {
	if r.ServiceMethod != ReceiveMessageMethod {
		return fmt.Errorf("unknown method %s", r.ServiceMethod)
	}

	msg, ok := body.(Message)
	if !ok {
		return fmt.Errorf("body %T is not a Message", body)
	}
	rPort := int(r.Seq + 1) // rPort is 1-indexed to indicate it's required

	cc.reqMutex.Lock()
	cc.outbound[rPort] = *r
	cc.reqMutex.Unlock()

	var senderReplyPort int
	if msg.NeedsReply {
		senderReplyPort = rPort
	}
	cc.send(msg.Port, senderReplyPort, msg.Data)
	if !msg.NeedsReply {
		return cc.Receive(rPort, false, "<no-reply-requested>")
	}
	return nil
}

// ReadResponseHeader decodes a response header from the VM.
func (cc *ClientCodec) ReadResponseHeader(r *rpc.Response) error {
	resp := <-cc.inbound
	*r = *resp
	cc.replyToRead = r.Seq
	return nil
}

// ReadResponseBody decodes a response body (currently just string) from the VM.
// and will always be called immediately after ReadResponseHeader (cf.
// https://pkg.go.dev/net/rpc#ClientCodec ).
func (cc *ClientCodec) ReadResponseBody(body interface{}) error {
	cc.mutex.Lock()
	reply := cc.replies[cc.replyToRead]
	delete(cc.replies, cc.replyToRead)
	cc.mutex.Unlock()

	if body != nil {
		*body.(*string) = reply
	}
	return nil
}

// Receive is called by the VM to send a response to the client.
func (cc *ClientCodec) Receive(rPort int, isError bool, data string) error {
	cc.reqMutex.Lock()
	outb := cc.outbound[rPort]
	delete(cc.outbound, rPort)
	cc.reqMutex.Unlock()

	resp := &rpc.Response{
		ServiceMethod: outb.ServiceMethod,
		Seq:           outb.Seq,
	}
	if isError {
		resp.Error = data
	} else {
		cc.mutex.Lock()
		cc.replies[resp.Seq] = data
		cc.mutex.Unlock()
	}
	cc.inbound <- resp
	return nil
}

func (cc *ClientCodec) Close() error {
	return nil
}
