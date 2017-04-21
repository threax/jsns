;
var Module = (function () {
    function Module(name, loader) {
        this.loader = loader;
        this.loadingDelayed = false;
        this.exports = {};
    }
    Module.prototype.isLoadingDelayed = function () {
        return this.loadingDelayed;
    };
    Module.prototype.delayLoading = function () {
        this.loadingDelayed = true;
    };
    Module.prototype.loaded = function () {
        this.loader.setModuleLoaded(name, self);
        this.loader.loadRunners();
    };
    return Module;
}());
var Library = (function () {
    function Library(name, depNames, factory, loader) {
        this.dependencies = [];
        this.name = name;
        this.factory = factory;
        if (depNames) {
            for (var i = 0; i < depNames.length; ++i) {
                var depName = depNames[i];
                this.dependencies.push({
                    name: depName,
                    loaded: loader.isModuleLoaded(depName)
                });
            }
        }
    }
    return Library;
}());
var ModuleManager = (function () {
    function ModuleManager() {
        this.loaded = {};
        this.unloaded = {};
        this.runners = [];
        this.runBlockers = [];
    }
    ModuleManager.prototype.addRunner = function (dependencies, factory) {
        this.runners.push(new Library("Runner", dependencies, factory, this));
    };
    ModuleManager.prototype.addModule = function (name, dependencies, factory) {
        this.unloaded[name] = new Library(name, dependencies, factory, this);
    };
    ModuleManager.prototype.isModuleLoaded = function (name) {
        return this.loaded[name] !== undefined;
    };
    ModuleManager.prototype.isModuleLoadable = function (name) {
        return this.unloaded[name] !== undefined;
    };
    ModuleManager.prototype.isModuleDefined = function (name) {
        return this.isModuleLoaded(name) || this.isModuleLoadable(name);
    };
    ModuleManager.prototype.loadModule = function (name) {
        var loaded = this.checkLib(this.unloaded[name]);
        if (loaded) {
            delete this.unloaded[name];
        }
        return loaded;
    };
    ModuleManager.prototype.setModuleLoaded = function (name, module) {
        if (this.loaded[name] === undefined) {
            this.loaded[name] = module;
        }
    };
    ModuleManager.prototype.checkLib = function (library) {
        var dependencies = library.dependencies;
        var fullyLoaded = true;
        var module = undefined;
        for (var i = 0; i < dependencies.length; ++i) {
            var dep = dependencies[i];
            dep.loaded = this.isModuleLoaded(dep.name);
            if (!dep.loaded && this.isModuleLoadable(dep.name)) {
                dep.loaded = this.loadModule(dep.name);
            }
            fullyLoaded = fullyLoaded && dep.loaded;
        }
        if (fullyLoaded) {
            module = new Module(library.name, this);
            var args = [module.exports, module];
            for (var i = 0; i < dependencies.length; ++i) {
                var dep = dependencies[i];
                args.push(this.loaded[dep.name].exports);
            }
            library.factory.apply(module, args);
            if (!module.isLoadingDelayed()) {
                this.setModuleLoaded(library.name, module);
            }
        }
        return fullyLoaded && !module.isLoadingDelayed();
    };
    ModuleManager.prototype.loadRunners = function () {
        if (this.runBlockers.length === 0) {
            for (var i = 0; i < this.runners.length; ++i) {
                var runner = this.runners[i];
                if (this.checkLib(runner)) {
                    this.runners.splice(i--, 1);
                }
            }
        }
    };
    ModuleManager.prototype.debug = function () {
        if (this.runners.length > 0) {
            for (var i = 0; i < this.runners.length; ++i) {
                var runner = this.runners[i];
                console.log("Runner waiting " + runner.name);
                for (var j = 0; j < runner.dependencies.length; ++j) {
                    var dependency = runner.dependencies[j];
                    if (!this.isModuleLoaded(dependency.name)) {
                        this.recursiveWaitingDebug(dependency.name, 1);
                    }
                }
            }
        }
        else {
            console.log("No runners remaining.");
        }
    };
    ModuleManager.prototype.recursiveWaitingDebug = function (name, indent) {
        var indentStr = '';
        for (var i = 0; i < indent; ++i) {
            indentStr += ' ';
        }
        var module = this.unloaded[name];
        if (module !== undefined) {
            console.log(indentStr + module.name);
            for (var j = 0; j < module.dependencies.length; ++j) {
                var dependency = module.dependencies[j];
                if (!this.isModuleLoaded(dependency.name)) {
                    this.recursiveWaitingDebug(dependency.name, indent + 4);
                }
            }
        }
        else {
            console.log(indentStr + name + ' module not yet loaded.');
        }
    };
    ModuleManager.prototype.require = function () {
    };
    ModuleManager.prototype.discoverAmd = function (discoverFunc, callback) {
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
            args.unshift(this.require);
            factory.apply(this, args);
        });
    };
    ModuleManager.prototype.addRunnerBlocker = function (blockerName) {
        this.runBlockers.push(blockerName);
    };
    ModuleManager.prototype.removeRunnerBlocker = function (blockerName) {
        var index = this.runBlockers.indexOf(blockerName);
        if (index !== -1) {
            this.runBlockers.splice(index, 1);
            return true;
        }
        return false;
    };
    return ModuleManager;
}());
var jsns = jsns || (function () {
    var moduleManager = new ModuleManager();
    var retVal = {
        run: function (dependencies, factory) {
            moduleManager.addRunner(dependencies, factory);
            moduleManager.loadRunners();
        },
        define: function (name, dependencies, factory) {
            if (!moduleManager.isModuleDefined(name)) {
                moduleManager.addModule(name, dependencies, factory);
                moduleManager.loadRunners();
            }
        },
        amd: function (name, discoverFunc) {
            if (!moduleManager.isModuleDefined(name)) {
                moduleManager.discoverAmd(discoverFunc, function (dependencies, factory) {
                    retVal.define(name, dependencies, factory);
                });
                moduleManager.loadRunners();
            }
        },
        runAmd: function (discoverFunc) {
            moduleManager.discoverAmd(discoverFunc, function (dependencies, factory) {
                retVal.run(dependencies, factory);
            });
            moduleManager.loadRunners();
        },
        runNamedAmd: function (name) {
            retVal.run([name], function () { });
        },
        addRunnerBlocker: function (blockerName) {
            moduleManager.addRunnerBlocker(blockerName);
        },
        removeRunnerBlocker: function (blockerName) {
            if (moduleManager.removeRunnerBlocker(blockerName)) {
                moduleManager.loadRunners();
            }
        },
        debug: function () {
            moduleManager.debug();
        },
        writeLoadedModules: function () {
        }
    };
    return retVal;
})();
function define(name, deps, factory) {
    window.jsns.amd(name, function (cbDefine) {
        cbDefine(deps, factory);
    });
}
//# sourceMappingURL=jsns.js.map