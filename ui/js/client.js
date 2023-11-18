var VueRemote = {}
VueRemote.install = function (Vue, options) {
    Vue.Remote = (function (options) {
        var Client = null,
            Handlers = Object.create(null),
            socketPump = [],
            pumpInterval = null
            
        var options = options || {}
        options.secure = options.secure || false
        options.host = options.host || "localhost"
        options.port = options.port || 8080
        options.identifier = options.identifier || 'event'
        options.endpoint = options.endpoint || ''
        options.camelCase = options.camelCase || false

        /**
         * Connect to Websocket Server
         */
        function connect() {
            Client = new WebSocket('ws://' + options.host + (options.port ? ':' + options.port : ''))
            //Client = new WebSocket(`${(options.secure ? 'wss://' : 'ws://')}${options.host}${options.port ? ':' + options.port : ''}/${options.endpoint}`, options.protocol)

            Client.onopen = openHandler
            Client.onerror = errorHandler
            Client.onmessage = messageHandler
            Client.onclose = closeHandler
        }

        /**
         * Handle Server Connection Event
         * 
         * @param {Event} open
         */
        function openHandler(open) {
            console.log("Connected to Web Server")
            console.log(open)

            if (options.openHandler) options.openHandler(open)
        }

        /**
         * Handle Server Errors
         * 
         * @param {Event} error
         */
        function errorHandler(error) {
            console.log("Error occured")
            console.log(error)

            if (options.errorHandler) options.errorHandler(error)
        }

        /**
         * Handle Messages Returned from the Server
         * 
         * @param {MessageEvent} message
         * @returns
         */
        function messageHandler(message) {
            var Json = JSON.parse(message.data)
            var identifier = Json[options.identifier]
            var Events = Handlers[identifier]

            if (Events) {
                Events.forEach(
                    function (Event) {
                        //Event.callback.apply(Event.thisArg, [Json.data])
                        //Adapt to all respone format
                        Event.callback.apply(Event.thisArg, [Json])
                    }
                )
            }
        }

        /**
         * {EventListener} For When the Websocket Client Closes the Connection
         * 
         * @param {CloseEvent} close
         */
        function closeHandler(close) {
            if (options.closeHandler) options.closeHandler(close)

            if (pumpInterval) {
                window.clearInterval(pumpInterval)
                pumpInterval = null
            }

            Client = null
        }

        /**
         * Attaches Handlers to the Event Pump System
         * 
         * @param {Boolean} server      True/False whether the Server should process the trigger
         * @param {String} identifier   Unique Name of the trigger
         * @param {Function} callback   Function to be called when the trigger is tripped
         * @param {Object} [thisArg]    Arguement to be passed to the handler as `this`
         */
        function attachHandler(identifier, callback, thisArg) {
            console.log('Attach '+identifier)
            !(Handlers[identifier] || (Handlers[identifier] = [])).push({
                callback: callback,
                thisArg: thisArg
            })
        }

        /**
         * Detaches Handlers from the Event Pump System
         * 
         * @param {String} identifier   Unique Name of the trigger
         * @param {Function} callback   Function to be called when the trigger is tripped
         */
        function detachHandler(identifier, callback) {
            if (arguments.length === 0) {
                Handlers = Object.create(null)
                return
            }

            var Handler = Handlers[identifier]
            if (!Handler) return

            if (arguments.length === 1) {
                Handlers[identifier] = null
                return
            }

            for (var index = Handler.length - 1; index >= 0; index--) {
                if (Handler[index].callback === callback || Handler[index].callback.fn === callback) {
                    Handler.splice(index, 1)
                }
            }
        }


        /**
         * Handles Event Triggers
         * 
         * @param {String} identifier
         * @returns
         */
        function emitHandler(identifier) {
            var varargs = arguments[1] || undefined,
                args = []
            if (arguments.length > 2) {
                args = arguments.length > 1 ? [].slice.apply(arguments, [1]) : []
            }

            if (args.length > 1) {
                socketPump.push(
                    JSON.stringify({
                        'event': identifier,
                        'data': args
                    })
                )
                return
            }

            socketPump.push(
                JSON.stringify({
                    'event': identifier,
                    'data': varargs
                })
            )
        }

        /**
         * Sends Messages to the Websocket Server every 250 ms
         * 
         * @returns
         */
        function pumpHandler() {
            if (socketPump.length === 0) return
            if (!Client) connect()

            if (Client.readyState === WebSocket.OPEN) {
                socketPump.forEach(
                    function (item) { Client.send(item) }
                )

                socketPump.length = 0
            }
        }

        if (!pumpInterval) window.setInterval(pumpHandler, 250)
        connect();
        return {
            connect: connect,
            disconnect: function () {
                if (Client) {
                    Client.close()
                    Client = null
                }
            },
            attach: attachHandler,
            detach: detachHandler,
            emit: emitHandler
        }
    })(options)

    Vue.mixin({
        created: function () {
            if (this.$options.remote) {
                Handlers = this.$options.remote
                for (var name in Handlers) {
                    if (Handlers.hasOwnProperty(name) && typeof Handlers[name] === "function") {
                        Vue.Remote.attach(name, Handlers[name], this)
                    }
                }
            }
        },
        beforeDestroy: function () {
            if (this.$options.remote) {
                Handlers = this.$options.remote
                for (var name in Handlers) {
                    if (Handlers.hasOwnProperty(name) && typeof Handlers[name] === "function") {
                        Vue.Remote.detach(name, Handlers[name])
                    }
                }
            }
        }
    });

    Vue.prototype.$remote = {
        $on: function (identifier, callback) {
            Vue.Remote.attach(identifier, callback, this)
            return this
        },
        $once: function (identifier, callback) {
            var thisArg = this
            function once() {
                Vue.remote.detach(identifier, callback)
                callback.apply(thisArg, arguments)
            }

            once.fn = callback

            Vue.Remote.attach(identifier, once, thisArg)
            return thisArg
        },
        $off: function (identifier, callback) {
            Vue.Remote.detach(identifier, callback, this)
            return this
        },
        $emit: Vue.Remote.emit
    };
};