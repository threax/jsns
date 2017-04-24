var jsnsOptions = jsnsOptions || {};
var jsns = jsns ||
    (function (options) {
        var JsModuleInstance = (function () {
            function JsModuleInstance(definition, loader) {
                this.definition = definition;
                this.loader = loader;
                this.exports = {};
            }
            return JsModuleInstance;
        }());
        var JsModuleDefinition = (function () {
            function JsModuleDefinition(name, depNames, factory, loader, source, isRunner, moduleCodeFinder) {
                this.source = source;
                this.isRunner = isRunner;
                this.moduleCodeFinder = moduleCodeFinder;
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
            JsModuleDefinition.prototype.getModuleCode = function (ignoredSources) {
                if (ignoredSources.indexOf(this.source) !== -1) {
                    return '';
                }
                if (this.isRunner) {
                    return 'jsns.run("' + this.dependencies[0].name + '");\n';
                }
                if (this.moduleCodeFinder !== undefined) {
                    return this.moduleCodeFinder(this);
                }
                else {
                    return 'jsns.define("' + this.name + '", ' + this.getDependenciesArg() + ', ' + this.factory + ');\n';
                }
            };
            JsModuleDefinition.prototype.getDependenciesArg = function () {
                var deps = '[';
                var sep = '';
                for (var i = 0; i < this.dependencies.length; ++i) {
                    deps += sep + '"' + this.dependencies[i].name + '"';
                    sep = ',';
                }
                deps += ']';
                return deps;
            };
            return JsModuleDefinition;
        }());
        var ModuleManager = (function () {
            function ModuleManager(options) {
                this.loaded = {};
                this.unloaded = {};
                this.runners = [];
                this.fromModuleRunners = [];
                if (options === undefined) {
                    options = {};
                }
                this.options = options;
            }
            ModuleManager.prototype.addRunner = function (name, source) {
                var runnerModule = new JsModuleDefinition(name + "Runner", [name], this.runnerFunc, this, source, true);
                if (this.fromModuleRunners !== null) {
                    this.fromModuleRunners.push(runnerModule);
                }
                else {
                    this.runners.push(runnerModule);
                }
            };
            ModuleManager.prototype.addModule = function (name, dependencies, factory, moduleWriter) {
                this.unloaded[name] = new JsModuleDefinition(name, dependencies, factory, this, undefined, false, moduleWriter);
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
                var loaded = this.checkModule(this.unloaded[name]);
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
            ModuleManager.prototype.checkModule = function (check) {
                var dependencies = check.dependencies;
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
                    module = new JsModuleInstance(check, this);
                    if (!this.options.simulateModuleLoading) {
                        var args = [module.exports, module];
                        for (var i = 0; i < dependencies.length; ++i) {
                            var dep = dependencies[i];
                            args.push(this.loaded[dep.name].exports);
                        }
                        check.factory.apply(module, args);
                    }
                    this.setModuleLoaded(check.name, module);
                }
                return fullyLoaded;
            };
            ModuleManager.prototype.loadRunners = function () {
                this.fromModuleRunners = [];
                for (var i = 0; i < this.runners.length; ++i) {
                    var runner = this.runners[i];
                    if (this.checkModule(runner)) {
                        this.runners.splice(i--, 1);
                    }
                }
                var moreRunners = this.fromModuleRunners.length > 0;
                if (moreRunners) {
                    this.runners.concat(this.fromModuleRunners);
                }
                this.fromModuleRunners = undefined;
                if (moreRunners) {
                    this.loadRunners();
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
            ModuleManager.prototype.printLoaded = function () {
                console.log("Loaded Modules:");
                for (var p in this.loaded) {
                    if (this.loaded.hasOwnProperty(p)) {
                        console.log(p);
                    }
                }
            };
            ModuleManager.prototype.printUnloaded = function () {
                console.log("Unloaded Modules:");
                for (var p in this.unloaded) {
                    if (this.unloaded.hasOwnProperty(p)) {
                        console.log(p);
                    }
                }
            };
            ModuleManager.prototype.createFileFromLoaded = function (ignoredSources) {
                if (ignoredSources === undefined) {
                    ignoredSources = [];
                }
                var modules = "";
                for (var p in this.loaded) {
                    if (this.loaded.hasOwnProperty(p)) {
                        var mod = this.loaded[p];
                        modules += mod.definition.getModuleCode(ignoredSources);
                    }
                }
                return modules;
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
            ModuleManager.prototype.runnerFunc = function () { };
            return ModuleManager;
        }());
        var Loader = (function () {
            function Loader(moduleManager) {
                if (moduleManager === undefined) {
                    moduleManager = new ModuleManager();
                }
                this.moduleManager = moduleManager;
            }
            Loader.prototype.define = function (name, dependencies, factory) {
                if (!this.moduleManager.isModuleDefined(name)) {
                    this.moduleManager.addModule(name, dependencies, factory);
                    this.moduleManager.loadRunners();
                }
            };
            Loader.prototype.amd = function (name, discoverFunc) {
                var _this = this;
                if (!this.moduleManager.isModuleDefined(name)) {
                    this.discoverAmd(discoverFunc, function (dependencies, factory, amdFactory) {
                        _this.moduleManager.addModule(name, dependencies, factory, function (def) { return _this.writeAmdFactory(amdFactory, def); });
                    });
                    this.moduleManager.loadRunners();
                }
            };
            Loader.prototype.run = function (name, source) {
                this.moduleManager.addRunner(name, source);
                this.moduleManager.loadRunners();
            };
            Loader.prototype.debug = function () {
                this.moduleManager.debug();
            };
            Loader.prototype.printLoaded = function () {
                this.moduleManager.printLoaded();
            };
            Loader.prototype.printUnloaded = function () {
                this.moduleManager.printUnloaded();
            };
            Loader.prototype.createFileFromLoaded = function (ignoredSources) {
                return this.moduleManager.createFileFromLoaded(ignoredSources);
            };
            Loader.prototype.writeAmdFactory = function (amdFactory, def) {
                return 'define("' + def.name + '", ' + def.getDependenciesArg() + ', ' + amdFactory + ');\n';
            };
            Loader.prototype.require = function () {
            };
            Loader.prototype.discoverAmd = function (discoverFunc, callback) {
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
                }, factory);
            };
            return Loader;
        }());
        return new Loader(new ModuleManager(options));
    })(jsnsOptions);
function define(name, deps, factory) {
    jsns.amd(name, function (cbDefine) {
        cbDefine(deps, factory);
    });
}
//# sourceMappingURL=jsns.js.map