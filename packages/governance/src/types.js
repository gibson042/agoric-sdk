// @ts-check

/**
 * @typedef { 'choose_n' | 'order' | 'weight' } ChoiceMethod
 * * CHOOSE_N: This is "approval voting". The voter specifies some number of
 *    positions, and is endorsing them equally.
 * * ORDER: The voter assigns ordinal numbers to some of the positions. The
 *    positions will be treated as an ordered list with no gaps.
 * * WEIGHT: The voter assigns a distinct integer weight to some number of
 *   positions. The weights are not required to be distinct or consecutive.
 *   High numbers are most preferred.
 */

/**
 * @typedef { 'param_change' | 'election' | 'survey' } ElectionType
 * param_change is very specific. Survey means multiple answers are possible,
 * Election means some candidates are going to "win". It's not clear these are
 * orthogonal. The important distinction is that param_change has a structured
 * question, while the others have a question presented as a string.
 */

/**
 * @typedef { 'amount' | 'brand' | 'instance' | 'installation' | 'nat' |
 * 'ratio' | 'string' | 'unknown' } ParamType
 */

/**
 * @typedef { 'majority' | 'all' | 'no_quorum' } QuorumRule
 */

/**
 * @typedef {Object} SimpleQuestion
 * @property {string} text
 */

/**
 * @typedef { Amount | Brand | Installation | Instance | bigint |
 *   Ratio | string | unknown } ParamValue
 */

/**
 * @template T
 * @typedef {{ type: T, name: string }} ParamRecord
 */

/**
 * @typedef {ParamRecord<'amount'> & { value: Amount } |
 *   ParamRecord<'brand'> & { value: Brand } |
 *   ParamRecord<'installation'> & { value: Installation } |
 *   ParamRecord<'instance'> & { value: Instance } |
 *   ParamRecord<'nat'> & { value: bigint } |
 *   ParamRecord<'ratio'> & { value: Ratio } |
 *   ParamRecord<'string'> & { value: string } |
 *   ParamRecord<'unknown'> & { value: unknown }
 * } ParamDescription
 */

/**
 * @typedef { SimpleQuestion | ParamChangeQuestion } Question
 */

/**
 * @typedef {Object} QuestionTerms - BallotSpec plus the Registrar Instance and
 *   a numerical threshold for the quorum. (The ballotCounter doesn't know the
 *   size of the electorate, so the Registrar has to say what limit to enforce.)
 * @property {BallotSpec} ballotSpec
 * @property {number} quorumThreshold
 * @property {Instance} registrar
 */

/**
 * @typedef {Object} TextPosition
 * @property {string} text
 */

/**
 * @typedef { TextPosition | ChangeParamPosition |
 *   NoChangeParamPosition } Position
 */

/**
 * @typedef {Object} BallotSpec
 *   Specification when requesting a Ballot
 * @property {ChoiceMethod} method
 * @property {Question} question
 * @property {Position[]} positions
 * @property {ElectionType} electionType
 * @property {number} maxChoices
 * @property {ClosingRule} closingRule
 * @property {QuorumRule} quorumRule
 * @property {Position} tieOutcome
 */

/**
 * @typedef {BallotSpec} BallotDetails
 *    complete ballot details: ballotSpec plus counter and handle
 * @property {Instance} counterInstance - instance of the BallotCounter
 * @property {Handle<'Ballot'>} handle
 */

/**
 * @typedef {Object} GovernancePair
 * @property {Instance} governor
 * @property {Instance} governed
 */

/**
 * @typedef {Object} Ballot
 * @property {() => Instance} getBallotCounter
 * @property {(positions: Position[]) => CompletedBallot} choose
 * @property {() => BallotDetails} getDetails
 */

/**
 * @typedef {Object} CompleteEqualWeightBallot
 * @property {Question} question
 * @property {Handle<'Ballot'>} handle
 * @property {string[]} chosen - a list of equal-weight preferred positions
 */

/**
 * @typedef {Object} CompleteWeightedBallot
 * @property {Question} question
 * @property {Handle<'Ballot'>} handle
 * @property {Record<string,bigint>[]} weighted - list of positions with
 *   weights. BallotCounter may limit weights to a range or require uniqueness.
 */

/**
 * @typedef {Object} CompleteOrderedBallot
 * @property {Question} question
 * @property {Handle<'Ballot'>} handle
 * @property {string[]} ordered - ordered list of position from most preferred
 *   to least preferred
 */

/**
 * @typedef {Object} PositionCount
 * @property {string} position
 * @property {number} tally
 */

/**
 * @typedef {Object} VoteStatistics
 * @property {number} spoiled
 * @property {number} votes
 * @property {PositionCount[]} results
 */

/**
 * @typedef {Object} QuorumCounter
 * @property {(VoteStatistics) => boolean} check
 */

/**
 * @callback BuildBallot
 * @param {BallotSpec} ballotSpec
 * @param {Instance} instance - ballotCounter instance
 * @returns {Ballot}
 */

/**
 * @typedef {Object} BallotCounterCreatorFacet
 * @property {() => boolean} isOpen
 * @property {() => Ballot} getBallotTemplate
 * @property {() => VoterFacet} getVoterFacet
 */

/**
 * @typedef {Object} BallotCounterPublicFacet
 * @property {() => boolean} isOpen
 * @property {() => Ballot} getBallotTemplate
 * @property {() => Promise<Position>} getOutcome
 * @property {() => BallotDetails} getDetails
 * @property {() => Promise<VoteStatistics>} getStats
 */

/**
 * @typedef {Object} BallotCounterCloseFacet
 *   TEST ONLY: Should not be allowed to escape from contracts
 * @property {() => void} closeVoting
 */

/**
 * @typedef {Object} BallotCounterFacets
 * @property {BallotCounterPublicFacet} publicFacet
 * @property {BallotCounterCreatorFacet} creatorFacet
 * @property {BallotCounterCloseFacet} closeFacet
 */

/**
 * @callback BuildBallotCounter
 * @param {BallotSpec} ballotSpec
 * @param {bigint} threshold - ballotSpec includes quorumRule; the registrar
 *    converts that to a number that the counter can enforce.
 * @param {Instance} instance
 * @returns {BallotCounterFacets}
 */

/**
 * @typedef { CompleteEqualWeightBallot | CompleteOrderedBallot |
 *   CompleteWeightedBallot
 * } CompletedBallot
 */

/**
 * @callback LooksLikeBallotSpec
 * @param {BallotSpec} allegedBallotSpec
 * @returns {BallotSpec}
 */

/**
 * @callback LooksLikeQuestionForType
 * @param {ElectionType} electionType
 * @param {Question} question
 */

/**
 * @callback SubmitVote
 * @param {Handle<'Voter'>} seat
 * @param {ERef<CompletedBallot>} filledBallot
 * @param {bigint=} weight
 */

/**
 * @typedef {Object} RegistrarPublic
 * @property {() => Notifier<BallotDetails>} getQuestionNotifier
 * @property {() => ERef<Handle<'Ballot'>[]>} getOpenQuestions,
 * @property {() => string} getName
 * @property {() => Instance} getInstance
 * @property {(h: Handle<'Ballot'>) => ERef<Ballot>} getBallot
 */

/**
 * @typedef {Object} PoserFacet
 * @property {AddQuestion} addQuestion
 */

/**
 * @typedef {Object} RegistrarCreator
 *  addQuestion() can be used directly when the creator doesn't need any
 *  reassurance. When someone needs to connect addQuestion to the Registrar
 *  instance, getPoserInvitation() lets them get addQuestion with assurance.
 * @property {() => ERef<Invitation>} getPoserInvitation
 * @property {AddQuestion} addQuestion
 * @property {() => Invitation[]} getVoterInvitations
 * @property {() => Notifier<BallotDetails>} getQuestionNotifier
 * @property {() => RegistrarPublic} getPublicFacet
 */

/**
 * @typedef {Object} VoterFacet - a facet that the Registrar should hold
 *   tightly. It allows specification of the vote's weight, so the Registrar
 *   should distribute an attenuated wrapper that doesn't make that available!
 * @property {SubmitVote} submitVote
 */

/**
 * @typedef {Object} ClosingRule
 * @property {Timer} timer
 * @property {Timestamp} deadline
 */

/**
 * @callback CloseVoting
 * @param {ClosingRule} closingRule
 * @param {() => void} closeVoting
 */

/**
 * @typedef {Object} AddQuestionReturn
 * @property {BallotCounterPublicFacet} publicFacet
 * @property {BallotCounterCreatorFacet} creatorFacet
 * @property {Instance} instance
 */

/**
 * @callback AddQuestion
 * @param {Installation} voteCounter
 * @param {BallotSpec} ballotSpec
 * @returns {Promise<AddQuestionReturn>}
 */

/**
 * @typedef QuestionCreator
 * @property {AddQuestion} addQuestion
 */

/**
 * @callback CreateQuestion
 *
 * @param {string} name - The name of the parameter to change
 * @param {ParamValue} proposedValue - the proposed value for the named
 *   parameter
 * @param {Installation} ballotCounterInstallation - the ballotCounter to
 *   instantiate to count votes. Expected to be a binaryBallotCounter. Other
 *   ballotCounters might be added here, or might require separate governors.
 *   under management so users can trace it back and see that it would use
 *   this electionManager to manage parameters
 * @param {Instance} contractInstance - include the instance of the contract
 * @param {ClosingRule} closingRule - deadline and timer for closing voting
 * @returns {Promise<BallotDetails>}
 */

/**
 * @typedef {Object} ParamChangeQuestion
 * @property {ParamSpecification} paramSpec
 * @property {Instance} contract
 * @property {ParamValue} proposedValue
 */

/**
 * @typedef {Object} ParamChangePositions
 * @property {ChangeParamPosition} positive
 * @property {NoChangeParamPosition} negative
 */

/**
 * @callback MakeParamChangePositions
 *
 * Return a record containing the positive and negative positions for a ballot
 * question on changing the param to the proposedValue.
 *
 * @param {ParamSpecification} paramSpec
 * @param {ParamValue} proposedValue
 * @returns {ParamChangePositions}
 */

/**
 * @typedef {Object} ParamChangeBallotDetails
 *    details for a ballot that can change a contract parameter
 * @property {ChoiceMethod} method
 * @property {ParamChangeQuestion} question
 * @property {ParamChangePositions} positions
 * @property {ElectionType} electionType
 * @property {number} maxChoices
 * @property {ClosingRule} closingRule
 * @property {QuorumRule} quorumRule
 * @property {NoChangeParamPosition} tieOutcome
 * @property {Instance} counterInstance - instance of the BallotCounter
 * @property {Handle<'Ballot'>} handle
 */

/**
 * @typedef {Object} ParamManagerBase
 * @property {() => Record<Keyword,ParamDescription>} getParams
 * @property {(name: string) => ParamDescription} getParam
 */

/**
 * @typedef {{ [updater: string]: (arg: ParamValue) => void
 *  }} ParamManagerUpdaters
 * @typedef {ParamManagerBase & ParamManagerUpdaters} ParamManagerFull
 */

/**
 * @typedef {Array<ParamDescription>} ParamDescriptions
 */

/**
 * @typedef {Record<string, string[]>} ParameterNameList
 */

/**
 * @callback AssertParamManagerType
 * @param {ParamType} type
 * @param {ParamValue} value
 * @param {string} name
 */

/**
 * @callback BuildParamManager
 * @param {ParamDescriptions} paramDescriptions
 * @returns {ParamManagerFull}
 */

/**
 * @typedef {Object} ChangeParamPosition
 * @property {ParamSpecification} changeParam
 * @property {ParamValue} proposedValue
 */

/**
 * @typedef {Object} NoChangeParamPosition
 * @property {ParamSpecification} noChange
 */

/**
 * @typedef {Object} Governor
 * @property {CreateQuestion} createQuestion
 */

/**
 * @typedef {Object} GovernorPublic
 * @property {() => ERef<Instance>} getRegistrar
 * @property {() => ERef<Instance>} getGovernedContract
 * @property {(ballotCounter: Instance) => void} validateBallotCounter
 * @property {(regP: ERef<Instance>) => void} validateBallotRegistrar
 * @property {(details: BallotDetails) => void} validateBallotTimer
 */

/**
 * @typedef {Object} ParamSpecification
 * @property {string} key
 * @property {string} parameterName
 */

/**
 * @typedef {Object} ParamChangeVoteResult
 * @property {Instance} instance - instance of the BallotCounter
 * @property {ERef<BallotDetails>} details
 * @property {Promise<ParamValue>} outcomeOfUpdate - A promise for the result
 *    of updating the parameter value. Primarily useful for its behavior on
 *    rejection.
 */

/**
 * @typedef {Object} LimitedCreatorFacet
 *
 * The creatorFacet for the governed contract that will be passed to the
 * responsible party. It does not have access to the paramManager.
 * @property {() => Instance} getContractGovernor
 */

/**
 * @typedef {Object} ContractPowerfulCreatorFacet
 *
 *   A powerful facet that carries access to both the creatorFacet to be passed
 *   to the caller and the paramManager, which will be used exclusively by the
 *   ContractGovenor.
 * @property {() => ERef<LimitedCreatorFacet>} getLimitedCreatorFacet
 * @property {() => ParamManagerAccessor} getParamMgrAccessor
 */

/**
 * @typedef {Object} GovernedContract
 * @property {VoteOnParamChange} voteOnParamChange
 * @property {() => ERef<LimitedCreatorFacet>} getCreatorFacet - creator
 *   facet of the governed contract, without the tightly held ability to change
 *   param values.
 * @property {() => any} getPublicFacet - public facet of the governed contract
 * @property {() => ERef<Instance>} getInstance - instance of the governed
 *   contract
 */

/**
 * @callback AssertBallotConcernsQuestion
 * @param {string} paramName
 * @param {BallotDetails} ballotDetails
 */

/**
 * @callback StartGovernedContract
 * @param {RegistrarCreator} registrarCreatorFacet
 * @param {Installation} governedContractInstallation
 * @param {IssuerKeywordRecord} issuerKeywordRecord
 * @param {Terms} customTerms
 * @returns {GovernedContract}
 */

/**
 * @callback VoteOnParamChange
 * @param {ParamSpecification} paramSpec
 * @param {ParamValue} proposedValue
 * @param {Installation} ballotCounterInstallation
 * @param {bigint} deadline
 * @returns {ParamChangeVoteResult}
 */

/**
 * @typedef {Object} ParamManagerAccessor
 * @property {(paramSpec: ParamSpecification) => ParamManagerFull} get
 */

/**
 * @typedef {Object} ParamGovernor
 * @property {VoteOnParamChange} voteOnParamChange
 * @property {CreatedBallot} createdBallot
 */

/**
 * @callback SetupGovernance
 * @param {ERef<ParamManagerAccessor>} accessor
 * @param {ERef<PoserFacet>} poserFacet
 * @param {Instance} contractInstance
 * @param {Timer} timer
 * @returns {ParamGovernor}
 */

/**
 * @callback CreatedBallot
 *   Was this ballot created by this ContractGovernor?
 * @param {Instance} ballotInstance
 * @returns {boolean}
 */

/**
 * @callback PositionIncluded
 * @param {Position[]} positions
 * @param {Position} position
 * @returns {boolean}
 */

/**
 * @callback AssertContractGovernance
 *
 * @param {ERef<ZoeService>} zoe
 * @param {Instance} allegedGoverned
 * @param {Instance} allegedGovernor
 * @returns {GovernancePair}
 */

/**
 * @callback AssertContractRegistrar - assert that the contract uses the
 *   registrar
 *
 * @param {ERef<ZoeService>} zoe
 * @param {Instance} allegedGovernor
 * @param {Instance} allegedRegistrar
 */

/**
 * @callback ValidateBallotDetails
 *
 * Validate that the ballot details correspond to a parameter change question
 * that the registrar hosts, and that the ballotCounter and other details are
 * consistent.
 *
 * @param {ERef<ZoeService>} zoe
 * @param {Instance} registrar
 * @param {ParamChangeBallotDetails} details
 * @returns {Promise<*>}
 */

/**
 * @callback ValidateBallotFromCounter
 *
 * Validate that the ballots counted by the ballotCounter correspond to a
 * parameter change question that the registrar hosts, and that the
 * ballotCounter and other details are consistent.
 *
 * @param {ERef<ZoeService>} zoe
 * @param {Instance} registrar
 * @param {Instance} ballotCounter
 * @returns {Promise<*>}
 */

/**
 * @callback ValidateParamChangeBallot
 *
 * Validate that the details are appropriate for an election concerning a
 * parameter change for a governed contract.
 *
 * @param {ParamChangeBallotDetails} details
 */
