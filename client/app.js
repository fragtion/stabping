'use strict';

const {h, render, Component} = window.preact;

const SENTINEL_ERROR = -2100000000;
const SENTINEL_NODATA = -2000000000;
const TARGET_KINDS = [
    {
        name: 'tcpping',
        prettyName: 'TCP Ping',
        addrsPrompt: 'Addresses (host:port) to ping',
        valFormatter: function(val) {
            return (val / 1000).toFixed() + ' ms';
        }
    }
    /*
    {
        name: 'httpdownload',
        pretty_name: 'HTTP Download',
        valFormatter: function(val) {
            return 'NOT YET IMPLEMENTED';
        }
    }
    */
];

class SPSocket {
    constructor(port, cb, interval) {
        if (!interval) {
            interval = 20000;
        }

        this.addr = 'ws://' + window.location.hostname + ':' + port;
        this.socket = this.newSocket(cb);

        setInterval(function() {
            if (this.socket.readyState > 1) {
                console.log('Reconnecting WebSocket...');
                this.socket = this.newSocket(cb);
            }
        }.bind(this), interval);
    }

    newSocket(cb) {
        var socket = new WebSocket(this.addr);
        socket.binaryType = 'arraybuffer';
        socket.onmessage = cb;
        return socket;
    }
}

function ajax(method, dest, type, success, error, data) {
    var req = new XMLHttpRequest();
    req.responseType = type;
    req.open(method, dest, true);
    req.onreadystatechange = function() {
        if (req.readyState == 4) {
            if (req.status == 200) {
                if (success) {
                    success(req.response);
                }
            } else {
                if (error) {
                    error(req);
                }
            }
        }
    }
    req.send(data);
}

function currentTime() {
    return Math.floor(new Date() / 1000);
}

var timeLoaded = currentTime();
function hoursBack(hours) {
    if (hours == -2) {
        // All
        return 0;
    } else if (hours == -1) {
        // Since Load
        return timeLoaded;
    } else {
        // Some number of hours
        return currentTime() - (hours * 3600);
    }
}

function dateAxisFormatter(epochSeconds, gran, opts) {
    return Dygraph.dateAxisLabelFormatter(new Date(epochSeconds * 1000), gran, opts);
}

function dateFormatter(epochSeconds) {
    return Dygraph.dateString_(epochSeconds * 1000);
}

var autoValueRange = [0, null];

class Graph extends Component {
    constructor() {
        super();
        this.graph = null;
        this.pinnedRange = null;
    }

    componentDidMount() {
        var gvFormatter = function(val, opts, seriesName) {
            if (seriesName == 'Time') {
                return dateFormatter(val);
            } else {
                return this.props.valFormatter(val);
            }
        }.bind(this);

        this.graph = new Dygraph(
            this.base,
            [[0]],
            {
                valueFormatter: gvFormatter,
                valueRange: autoValueRange,
                axes: {
                    x: {
                        axisLabelFormatter: dateAxisFormatter
                    },
                    y: {
                        axisLabelFormatter: this.props.valFormatter
                    }
                },
                isZoomedIgnoreProgrammaticZoom: true,
                zoomCallback: function (lowerDate, upperDate, yRanges) {
                    this.update();
                }.bind(this)
            }
        );
    }

    update() {
        if (!this.graph || !this.props.data) return;

        // object containing all the graph options we want to update
        var g = {};

        if (!this.graph.isZoomed()) {
            g.isZoomedIgnoreProgrammaticZoom = true;
            g.labels = ['Time'].concat(this.props.options.addrs);

            var h = hoursBack(this.props.preset);
            g.dateWindow = h == 0 ? null : [h, this.props.data.slice(-1)[0][0]];

            g.file = this.props.data;
        }

        if (this.graph.getOption('rollPeriod') != this.props.rollPeriod) {
            g.rollPeriod = this.props.rollPeriod;
        }

        if (this.pinnedRange == null && this.props.shouldPinRange) {
            this.pinnedRange = this.graph.yAxisRange();
            g.valueRange = this.pinnedRange;
        } else if (this.pinnedRange != null && !this.props.shouldPinRange) {
            this.pinnedRange = null;
            g.valueRange = autoValueRange;
        }

        if (Object.keys(g).length > 0) {
            this.graph.updateOptions(g);
        }
    }

    shouldComponentUpdate() {
        return false;
    }

    render() {
        return h('div', {
            className: 'graph'
        });
    }
}

class Options extends Component {
    componentWillMount() {
        console.log('Options Component will MOUNT.');
        this.state = JSON.parse(JSON.stringify(this.props.options))
        this.state.addrInput = '';
    }

    componentWillUnmount() {
        console.log('Options Component will UNMOUNT.');
    }

    getOptions() {
        delete this.state.addrInput;
        return this.state;
    }

    render() {
        return h('div', {className: 'options-container'}, [
            h('h3', null, this.props.kind.prettyName + ' Options'),
            h('div', null, [
                'Collect data every',
                h('input', {
                    type: 'number',
                    value: this.state.interval / 1000,
                    onChange: (evt) => this.setState({interval: evt.target.value * 1000}),
                    title: 'seconds'
                }),
                's'
            ]),
            h('div', null, [
                'Avg across',
                h('input', {
                    type: 'number',
                    value: this.state.avg_across,
                    onChange: (evt) => this.setState({avg_across: evt.target.value})
                }),
                'values'
            ]),
            h('div', null, [
                this.props.kind.addrsPrompt,
                h('ul', null, [
                    this.state.addrs.map(function(val, i, arr) {
                        return h('li', {className: 'addr-item'}, [
                            h('button', {
                                onClick: () => {
                                    arr.splice(i, 1);
                                    this.setState({addrs: arr});
                                }
                            }, '-'),
                            val
                        ]);
                    }.bind(this))
                ]),
                h('div', {className: 'addr-input'}, [
                    h('input', {
                        type: 'text',
                        value: this.state.addrInput,
                        onInput: (evt) => this.setState({addrInput: evt.target.value})
                    }),
                    h('button', {
                        onClick: () => {
                            var addrs = this.state.addrs;
                            addrs.push(this.state.addrInput);
                            this.setState({
                                addrInput: '',
                                addrs: addrs
                            });
                        }
                    }, 'Add')
                ])
            ])
        ])
    }
}

class Target extends Component {
    constructor(props) {
        super(props);
        this.state = {
            options: {},
            leftLimit: currentTime(),
            preset: 1,
            rollPeriod: 1,
            shouldPinRange: false,
            optionsMode: false
        };
    }

    componentDidMount() {
        ajax('GET', '/api/target/' + this.props.kind.name, 'json', function(res) {
            console.log('Fetched option for: ' + this.props.kind.name);
            this.setState({
                options: res
            });

            setTimeout(function() {
                this.persistentDataRetrieve(this.state.preset);
            }.bind(this), 300);
        }.bind(this));
    }

    persistentDataRetrieve(hoursPreset) {
        if (hoursPreset == 0) {
            return;
        }

        var leftTarget = hoursBack(hoursPreset);
        var leftLimit = this.state.leftLimit;
        var elementLength = this.state.options.addrs.length + 1;
        var nonce = this.state.options.nonce;

        if (leftTarget < leftLimit) {
            ajax('POST', '/api/target/' + this.props.kind.name, 'arraybuffer', function(res) {
                if (nonce == this.state.options.nonce) {
                    var raw = new Int32Array(res);
                    var newData = new Array(Math.ceil(raw.length / elementLength));
                    let k = 0;

                    for (let j = 0; j < raw.length; j += elementLength) {
                        let arr = new Array(elementLength);
                        for (let i = 0; i < arr.length; i++) {
                            let n = raw[j + i];
                            arr[i] = n >= 0 ? n : null;
                        }
                        newData[k++] = arr;
                    }

                    if (newData[newData.length - 1] == undefined) {
                        newData.pop();
                    }

                    if (this.data) {
                        this.data = newData.concat(this.data);
                    } else {
                        this.data = newData;
                    }

                    this.setState({
                        leftLimit: leftTarget
                    });
                } else {
                    console.log('Nonce changed since persistent data retrieve!');
                }
            }.bind(this), function(err) {
                console.log('Failed to retrieve persistent data for range ' + leftTarget + ' to ' + leftLimit);
            }.bind(this), JSON.stringify({
                nonce: this.state.options.nonce,
                lower: leftTarget,
                upper: leftLimit
            }));
        }
    }

    onPresetChange(evt) {
        this.persistentDataRetrieve(evt.target.value);
        this.setState({preset: evt.target.value});
    }

    onSaveOptions() {
        if (this.state.optionsMode) {
            console.log('Checking options for differences...');
            // diff new options and current options and only hit server if different
            var newOpts = this.optionsComponent.getOptions();
            var curOpts = this.state.options;

            var optsChanged = newOpts.interval != curOpts.interval ||
                              newOpts.avg_across != curOpts.avg_across ||
                              newOpts.pause != curOpts.pause;
            var addrsChanged = newOpts.addrs.length != curOpts.addrs.length;

            for (let i = 0; !addrsChanged && i < newOpts.addrs.length; i++) {
                if (newOpts.addrs[i] != curOpts.addrs[i]) {
                    addrsChanged = true;
                }
            }

            if (optsChanged || addrsChanged) {
                console.log('Saving options to server...');
                ajax('PUT', '/api/target/' + this.props.kind.name, 'text', function(res) {
                    console.log('Server accepted options update.');
                    var newNonce = parseInt(res, 10);
                    newOpts.nonce = newNonce;
                    var newState = {
                        options: newOpts,
                        optionsMode: false
                    };
                    if (addrsChanged) {
                        // if the addrs has changed, we must invalidate the graph
                        this.data = null;
                        newState.leftLimit = currentTime();
                    }
                    this.setState(newState, function() {
                        this.persistentDataRetrieve(this.state.preset);
                    }.bind(this));
                }.bind(this), function(err) {
                    consoloe.log('Failed to update options on server! ' + err);
                }.bind(this), JSON.stringify(newOpts))
            }

            delete this.optionsComponent;
        }
    }

    render() {
        let buttons, controls;
        if (this.state.optionsMode) {
            buttons = [
                h('button', {
                    onClick: () => this.setState({optionsMode: false})
                }, 'Cancel'),
                h('button', {
                    className: 'btn-primary',
                    onClick: this.onSaveOptions.bind(this)
                }, 'Save')
            ];
            controls = h(Options, {
                ref: (o) => {
                    this.optionsComponent = o;
                },
                kind: this.props.kind,
                options: this.state.options
            });
        } else {
            buttons = h('button', {
                className: 'btn-icon',
                onClick: () => this.setState({optionsMode: true})
            }, '⚙');
            controls = [
                h('label', {className: 'select-label'}, 'Base Time Interval'),
                h('select', {
                    className: 'base-interval-select',
                    value: this.state.preset,
                    onChange: this.onPresetChange.bind(this)
                }, [
                    h('option', {value: -1}, 'Since Load'),
                    h('option', {value: 0.25}, '15 Minutes'),
                    h('option', {value: 0.5}, '30 Minutes'),
                    h('option', {value: 1}, '1 Hour'),
                    h('option', {value: 3}, '3 Hours'),
                    h('option', {value: 6}, '6 Hours'),
                    h('option', {value: 12}, '12 Hours'),
                    h('option', {value: 24}, '1 Day'),
                    h('option', {value: 72}, '3 Days'),
                    h('option', {value: 168}, '1 Week'),
                    h('option', {value: 336}, '2 Weeks'),
                    h('option', {value: 744}, '1 Month'),
                    h('option', {value: -2}, 'All*')
                ]),
                h('span', null, [
                    'Roll avg over',
                    h('input', {
                        type: 'number',
                        value: this.state.rollPeriod,
                        onChange: (evt) => this.setState({rollPeriod: evt.target.value})
                    }),
                    'point(s)'
                ]),
                h('label', {className: 'checkbox-label'}, [
                    h('input', {
                        type: 'checkbox',
                        checked: this.state.shouldPinRange,
                        onClick: () => this.setState({shouldPinRange: !this.state.shouldPinRange})
                    }),
                    'Pin/lock value range'
                ])
            ];
        }

        return h('div', {
            className: 'graph-container'
        }, [
            h('div', {className: 'target-head'}, [
                h('h2', null, this.props.kind.prettyName),
                h('div', {className: 'button-container'}, buttons)
            ]),
            h(Graph, {
                ref: (g) => {
                    g.update();
                },
                kind: this.props.kind,
                valFormatter: this.props.valFormatter,
                data: this.data,
                options: this.state.options,
                preset: this.state.preset,
                rollPeriod: this.state.rollPeriod,
                shouldPinRange: this.state.shouldPinRange
            }),
            h('div', {className: 'graph-controls'}, controls)
        ]);
    }

    liveDataUpdate(nonce, inArr) {
        if (nonce != this.state.options.nonce) {
            console.log('Mismatched nonce! I have ' + this.state.options.nonce +
                        ' but this new one is ' + nonce);
            console.log(arr);
        }

        if (!this.data) {
            this.data = [];
        }

        var arr = new Array(inArr.length);
        for (let i = 0; i < arr.length; i++) {
            let n = inArr[i];
            arr[i] = n >= 0 ? n : null;
        }
        this.data.push(arr);

        this.forceUpdate();
    }
}

class App extends Component {
    constructor() {
        super();
        this.targets = new Array(TARGET_KINDS.length);
    }

    handleSocketMessage(message) {
        var buf = message.data;
        var raw = new Int32Array(buf);

        var kind_id = raw[0];
        var nonce = raw[1];
        var arr = raw.slice(2);
        this.targets[kind_id].liveDataUpdate(nonce, arr);
    }

    componentDidMount() {
        ajax('GET', '/api/config/ws_port', 'text', function(port_str) {
            new SPSocket(port_str, this.handleSocketMessage.bind(this));
        }.bind(this));
    }

    render() {
        var target_components = [];

        for (let i = 0; i < TARGET_KINDS.length; i++) {
            let kind = TARGET_KINDS[i];
            target_components.push(h(Target, {
                ref: (t) => {
                    this.targets[i] = t;
                },
                kind: kind,
                valFormatter: kind.valFormatter
            }));
        }

        return h('div', null, target_components);
    }
}

render(h(App), document.body);
