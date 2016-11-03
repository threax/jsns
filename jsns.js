var jsns = (function () {
    "use strict";
    var loaded = {};
    var unloaded = {};
    var runners = [];
    var runBlockers = [];
    function isModuleLoaded(name) {
        return loaded[name] !== undefined;
    }
    function isModuleLoadable(name) {
        return unloaded[name] !== undefined;
    }
    function loadModule(name) {
        var loaded = checkLib(unloaded[name]);
        if (loaded) {
            delete unloaded[name];
        }
        return loaded;
    }
    function setModuleLoaded(name, module) {
        if (loaded[name] === undefined) {
            loaded[name] = module;
        }
    }
    function Module(name) {
        var loadingDelayed = false;
        var self = this;
        this.exports = {};
        this.isLoadingDelayed = function () {
            return loadingDelayed;
        };
        this.delayLoading = function () {
            loadingDelayed = true;
        };
        this.loaded = function () {
            setModuleLoaded(name, self);
            loadRunners();
        };
    }
    function checkLib(library) {
        var dependencies = library.dependencies;
        var fullyLoaded = true;
        var module = undefined;
        for (var i = 0; i < dependencies.length; ++i) {
            var dep = dependencies[i];
            dep.loaded = isModuleLoaded(dep.name);
            if (!dep.loaded && isModuleLoadable(dep.name)) {
                dep.loaded = loadModule(dep.name);
            }
            fullyLoaded = fullyLoaded && dep.loaded;
        }
        if (fullyLoaded) {
            module = new Module(library.name);
            var args = [module.exports, module];
            for (var i = 0; i < dependencies.length; ++i) {
                var dep = dependencies[i];
                args.push(loaded[dep.name].exports);
            }
            library.factory.apply(module, args);
            if (!module.isLoadingDelayed()) {
                setModuleLoaded(library.name, module);
            }
        }
        return fullyLoaded && !module.isLoadingDelayed();
    }
    function Library(name, depNames, factory) {
        this.name = name;
        this.factory = factory;
        this.dependencies = [];
        if (depNames) {
            for (var i = 0; i < depNames.length; ++i) {
                var depName = depNames[i];
                this.dependencies.push({
                    name: depName,
                    loaded: isModuleLoaded(depName)
                });
            }
        }
    }
    function loadRunners() {
        if (runBlockers.length === 0) {
            for (var i = 0; i < runners.length; ++i) {
                var runner = runners[i];
                if (checkLib(runner)) {
                    runners.splice(i--, 1);
                }
            }
        }
    }
    function recursiveWaitingDebug(name, indent) {
        var indentStr = '';
        for (var i = 0; i < indent; ++i) {
            indentStr += ' ';
        }
        var module = unloaded[name];
        if (module !== undefined) {
            console.log(indentStr + module.name);
            for (var j = 0; j < module.dependencies.length; ++j) {
                var dependency = module.dependencies[j];
                if (!isModuleLoaded(dependency.name)) {
                    recursiveWaitingDebug(dependency.name, indent + 4);
                }
            }
        }
        else {
            console.log(indentStr + name + ' module not yet loaded.');
        }
    }
    function require() {
    }
    function discoverAmd(discoverFunc, callback) {
        var dependencies;
        var factory;
        discoverFunc(function (dep, fac) {
            dependencies = dep;
            factory = fac;
        });
        dependencies.splice(0, 2);
        for (var i = 0; i < dependencies.length; ++i) {
            var dep = dependencies[i];
            if (dep[0] === '.' && dep[1] === '/') {
                dependencies[i] = dep.substring(2);
            }
        }
        callback(dependencies, function (exports, module) {
            var args = [];
            for (var _i = 2; _i < arguments.length; _i++) {
                args[_i - 2] = arguments[_i];
            }
            args.unshift(exports);
            args.unshift(require);
            factory.apply(this, args);
        });
    }
    var retVal = {
        run: function (dependencies, factory) {
            runners.push(new Library("AnonRunner", dependencies, factory));
            loadRunners();
        },
        define: function (name, dependencies, factory) {
            unloaded[name] = new Library(name, dependencies, factory);
            loadRunners();
        },
        amd: function (name, discoverFunc) {
            discoverAmd(discoverFunc, function (dependencies, factory) {
                retVal.define(name, dependencies, factory);
            });
            loadRunners();
        },
        runAmd: function (discoverFunc) {
            discoverAmd(discoverFunc, function (dependencies, factory) {
                retVal.run(dependencies, factory);
            });
            loadRunners();
        },
        addRunnerBlocker: function (blockerName) {
            runBlockers.push(blockerName);
        },
        removeRunnerBlocker: function (blockerName) {
            var index = runBlockers.indexOf(blockerName);
            if (index !== -1) {
                runBlockers.splice(index, 1);
                loadRunners();
            }
        },
        debug: function () {
            if (runners.length > 0) {
                for (var i = 0; i < runners.length; ++i) {
                    var runner = runners[i];
                    console.log("Runner waiting " + runner.name);
                    for (var j = 0; j < runner.dependencies.length; ++j) {
                        var dependency = runner.dependencies[j];
                        if (!isModuleLoaded(dependency.name)) {
                            recursiveWaitingDebug(dependency.name, 0);
                        }
                    }
                }
            }
            else {
                console.log("No runners remaining.");
            }
        }
    };
    return retVal;
})();
//# sourceMappingURL=jsns.js.map