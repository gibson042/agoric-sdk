package types_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	codec "github.com/cosmos/cosmos-sdk/codec"
	cdctypes "github.com/cosmos/cosmos-sdk/codec/types"

	transfertypes "github.com/cosmos/ibc-go/v6/modules/apps/transfer/types"
	clienttypes "github.com/cosmos/ibc-go/v6/modules/core/02-client/types"
	channeltypes "github.com/cosmos/ibc-go/v6/modules/core/04-channel/types"

	"github.com/Agoric/agoric-sdk/golang/cosmos/types"
)

func TestExtractBaseAddress(t *testing.T) {
	bases := []struct {
		name string
		addr string
	}{
		{"agoric address", "agoric1qqp0e5ys"},
		{"cosmos address", "cosmos1qqxuevtt"},
	}

	suffixes := []struct {
		hookStr     string
		baseIsWrong bool
		isErr       bool
	}{
		{"", false, false},
		{"/", false, false},
		{"/sub/account", false, false},
		{"?query=something&k=v&k2=v2", false, false},
		{"?query=something&k=v&k2=v2#fragment", false, false},
		{"unexpected", false, false},
		{"\x01", false, false},
	}

	for _, b := range bases {
		b := b
		for _, s := range suffixes {
			s := s
			t.Run(b.name+" "+s.hookStr, func(t *testing.T) {
				addrHook, err := types.JoinHookedAddress(b.addr, []byte(s.hookStr))
				require.NoError(t, err)
				addr, err := types.ExtractBaseAddress(addrHook)
				if s.isErr {
					require.Error(t, err)
				} else {
					require.NoError(t, err)
					if s.baseIsWrong {
						require.NotEqual(t, b.addr, addr)
					} else {
						require.Equal(t, b.addr, addr)
						addr, hookData, err := types.SplitHookedAddress(addrHook)
						require.NoError(t, err)
						require.Equal(t, b.addr, addr)
						require.Equal(t, s.hookStr, string(hookData))
					}
				}
			})
		}
	}
}

func TestExtractBaseAddressFromPacket(t *testing.T) {
	ir := cdctypes.NewInterfaceRegistry()
	cdc := codec.NewProtoCodec(ir)
	transfertypes.RegisterInterfaces(ir)
	channeltypes.RegisterInterfaces(ir)
	clienttypes.RegisterInterfaces(ir)

	cosmosAddr := "cosmos1qqxuevtt"
	cosmosHookStr := "?foo=bar&baz=bot#fragment"
	cosmosHook, err := types.JoinHookedAddress(cosmosAddr, []byte(cosmosHookStr))
	require.NoError(t, err)
	addr, hookData, err := types.SplitHookedAddress(cosmosHook)
	require.NoError(t, err)
	require.Equal(t, cosmosAddr, addr)
	require.Equal(t, cosmosHookStr, string(hookData))

	agoricAddr := "agoric1qqp0e5ys"
	agoricHookStr := "?bingo=again"
	agoricHook, err := types.JoinHookedAddress(agoricAddr, []byte(agoricHookStr))
	require.NoError(t, err)
	addr, hookData, err = types.SplitHookedAddress(agoricHook)
	require.NoError(t, err)
	require.Equal(t, agoricAddr, addr)
	require.Equal(t, agoricHookStr, string(hookData))

	cases := []struct {
		name  string
		addrs map[types.AddressRole]struct{ addr, baseAddr string }
	}{
		{"sender has params",
			map[types.AddressRole]struct{ addr, baseAddr string }{
				types.RoleSender:   {cosmosHook, "cosmos1qqxuevtt"},
				types.RoleReceiver: {"agoric1qqp0e5ys", "agoric1qqp0e5ys"},
			},
		},
		{"receiver has params",
			map[types.AddressRole]struct{ addr, baseAddr string }{
				types.RoleSender:   {"cosmos1qqxuevtt", "cosmos1qqxuevtt"},
				types.RoleReceiver: {agoricHook, "agoric1qqp0e5ys"},
			},
		},
		{"both are base",
			map[types.AddressRole]struct{ addr, baseAddr string }{
				types.RoleSender:   {"cosmos1qqxuevtt", "cosmos1qqxuevtt"},
				types.RoleReceiver: {"agoric1qqp0e5ys", "agoric1qqp0e5ys"},
			},
		},
		{"both have params",
			map[types.AddressRole]struct{ addr, baseAddr string }{
				types.RoleSender:   {agoricHook, "agoric1qqp0e5ys"},
				types.RoleReceiver: {cosmosHook, "cosmos1qqxuevtt"},
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			ftPacketData := transfertypes.NewFungibleTokenPacketData("denom", "100", tc.addrs[types.RoleSender].addr, tc.addrs[types.RoleReceiver].addr, "my-favourite-memo")
			packetBz, err := cdc.MarshalJSON(&ftPacketData)
			require.NoError(t, err)
			packet := channeltypes.NewPacket(packetBz, 1234, "my-port", "my-channel", "their-port", "their-channel", clienttypes.NewHeight(133, 445), 10999)

			for role, addrs := range tc.addrs {
				addrs := addrs
				role := role

				t.Run(string(role), func(t *testing.T) {
					baseAddr, err := types.ExtractBaseAddress(addrs.addr)
					require.NoError(t, err)
					require.Equal(t, addrs.baseAddr, baseAddr)

					packetBaseAddr, err := types.ExtractBaseAddressFromPacket(cdc, packet, role, nil)
					require.NoError(t, err)
					require.Equal(t, addrs.baseAddr, packetBaseAddr)

					var newPacket channeltypes.Packet
					packetBaseAddr2, err := types.ExtractBaseAddressFromPacket(cdc, packet, role, &newPacket)
					require.NoError(t, err)
					require.Equal(t, addrs.baseAddr, packetBaseAddr2)

					var basePacketData transfertypes.FungibleTokenPacketData
					err = cdc.UnmarshalJSON(newPacket.GetData(), &basePacketData)
					require.NoError(t, err)

					// Check that the only difference between the packet data is the baseAddr.
					packetData := basePacketData
					switch role {
					case types.RoleSender:
						require.Equal(t, addrs.baseAddr, basePacketData.Sender)
						packetData.Sender = addrs.addr
					case types.RoleReceiver:
						require.Equal(t, addrs.baseAddr, basePacketData.Receiver)
						packetData.Receiver = addrs.addr
					default:
						t.Fatal("unexpected role", role)
					}

					require.Equal(t, ftPacketData, packetData)
				})
			}
		})
	}
}
