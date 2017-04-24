interface ModuleManagerOptions {
    //Simulate loading modules, will skip calling any actual factories, but will still mark modules as loaded.
    //Useful for build time module level tree shaking.
    simulateModuleLoading?: boolean
}

var jsnsOptions: ModuleManagerOptions = jsnsOptions || {};
var jsnsDefine = jsnsDefine || 
    (function (options?: ModuleManagerOptions) {
        interface Dependency {
            name: string,
            loaded: boolean
        }

        interface Map<T> {
            [key: string]: T;
        }

        class JsModuleInstance {
            constructor(public definition: JsModuleDefinition, private loader: ModuleManager) {

            }

            public exports: any = {};
        }

        type ModuleCodeFinder = (def: JsModuleDefinition) => any;

        class JsModuleDefinition {
            name: string;
            factory;
            dependencies: Dependency[] = [];

            constructor(name: string, depNames: string[], factory, loader: ModuleManager, private source: string, private isRunner: boolean, private moduleCodeFinder?: ModuleCodeFinder) {
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

            public getModuleCode(ignoredSources: any[]) {
                if(ignoredSources.indexOf(this.source) !== -1){
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
            }

            public getDependenciesArg() {
                var deps = '[';
                var sep = '';
                for (var i = 0; i < this.dependencies.length; ++i) {
                    deps += sep + '"' + this.dependencies[i].name + '"';
                    sep = ','
                }
                deps += ']';
                return deps;
            }
        }

        class ModuleManager {
            private loaded: Map<JsModuleInstance> = {};
            private loadedOrder: string[] = [];
            private unloaded: Map<JsModuleDefinition> = {};
            private runners: JsModuleDefinition[] = [];
            private fromModuleRunners: JsModuleDefinition[] = null; //When calling run from a module you can't add the runner to the runner's list, this will accumulate the runners during that time.
            private options: ModuleManagerOptions;

            constructor(options?: ModuleManagerOptions) {
                if (options === undefined) {
                    options = {};
                }
                this.options = options;
            }

            /**
             * Add a runner to the module manager. This will add the runner in such a way that more runners can be defined during
             * module execution. If such a run is invoked it will be deferred until the current module stops executing.
             * Because of this management, loadRunners will be called automaticly by the addRunner funciton. There is no reason
             * for a client class to call that function for runners, and in fact that can create errors.
             */
            addRunner(name: string, source: string) {
                var runnerModule = new JsModuleDefinition(name + "Runner", [name], this.runnerFunc, this, source, true); 
                if(this.fromModuleRunners !== null){
                    this.fromModuleRunners.push(runnerModule);
                }
                else{
                    this.runners.push(runnerModule);
                    this.loadRunners();
                }
            }

            /**
             * Add a module to the module manager. Due to the variety of ways that a module could be added the user is responsible for
             * calling loadRunners() when they are ready to try to load modules.
             */
            addModule(name: string, dependencies: string[], factory, moduleWriter?: ModuleCodeFinder) {
                this.unloaded[name] = new JsModuleDefinition(name, dependencies, factory, this, undefined, false, moduleWriter);
            }

            isModuleLoaded(name: string) {
                return this.loaded[name] !== undefined;
            }

            isModuleLoadable(name: string) {
                return this.unloaded[name] !== undefined;
            }

            isModuleDefined(name: string) {
                return this.isModuleLoaded(name) || this.isModuleLoadable(name);
            }

            loadModule(name: string) {
                var loaded = this.checkModule(this.unloaded[name]);
                if (loaded) {
                    delete this.unloaded[name];
                }
                return loaded;
            }

            setModuleLoaded(name: string, module: JsModuleInstance) {
                if (this.loaded[name] === undefined) {
                    this.loaded[name] = module;
                    this.loadedOrder.push(name);
                }
            }

            checkModule(check: JsModuleDefinition) {
                var dependencies = check.dependencies;
                var fullyLoaded = true;
                var module: JsModuleInstance = undefined;

                //Check to see if depenedencies are loaded and if they aren't and can be, load them
                for (var i = 0; i < dependencies.length; ++i) {
                    var dep = dependencies[i];
                    dep.loaded = this.isModuleLoaded(dep.name);
                    if (!dep.loaded && this.isModuleLoadable(dep.name)) {
                        dep.loaded = this.loadModule(dep.name);
                    }
                    fullyLoaded = fullyLoaded && dep.loaded;
                }

                //If all dependencies are loaded, load this library
                if (fullyLoaded) {
                    module = new JsModuleInstance(check, this);

                    if (!this.options.simulateModuleLoading) {
                        var args = [module.exports, module];

                        //Inject dependency arguments
                        for (var i = 0; i < dependencies.length; ++i) {
                            var dep = dependencies[i];
                            args.push(this.loaded[dep.name].exports);
                        }

                        check.factory.apply(module, args);
                    }

                    this.setModuleLoaded(check.name, module);
                }

                return fullyLoaded;
            }

            loadRunners() {
                this.fromModuleRunners = [];
                for (var i = 0; i < this.runners.length; ++i) {
                    var runner = this.runners[i];
                    if (this.checkModule(runner)) {
                        this.runners.splice(i--, 1);
                    }
                }
                var moreRunners = this.fromModuleRunners.length > 0; 
                if(moreRunners){
                    this.runners = this.runners.concat(this.fromModuleRunners);
                }
                this.fromModuleRunners = null;
                if(moreRunners){
                    this.loadRunners();
                }
            }

            debug() {
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
            }

            printLoaded() {
                console.log("Loaded Modules:");
                for (var p in this.loaded) {
                    if (this.loaded.hasOwnProperty(p)) {
                        console.log(p);
                    }
                }
            }

            printUnloaded() {
                console.log("Unloaded Modules:");
                for (var p in this.unloaded) {
                    if (this.unloaded.hasOwnProperty(p)) {
                        console.log(p);
                    }
                }
            }

            createFileFromLoaded(ignoredSources?: any[]) {
                if(ignoredSources === undefined){
                    ignoredSources = [];
                } 

                var modules = "var jsnsOptions = jsnsOptions || {};\nvar jsnsDefine =" + jsnsDefine + "\nvar jsns = jsns || jsnsDefine(jsnsOptions);\n";
                for(var i = 0; i < this.loadedOrder.length; ++i){
                    var p = this.loadedOrder[i];
                    if (this.loaded.hasOwnProperty(p)) {
                        var mod = this.loaded[p];
                        modules += mod.definition.getModuleCode(ignoredSources);
                    }
                }
                return modules;
            }

            private recursiveWaitingDebug(name, indent) {
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
            }

            private runnerFunc() {}
        }

        class Loader {
            private moduleManager: ModuleManager;

            constructor(moduleManager?: ModuleManager) {
                if (moduleManager === undefined) {
                    moduleManager = new ModuleManager();
                }
                this.moduleManager = moduleManager;
            }

            define(name: string, dependencies: string[], factory) {
                if (!this.moduleManager.isModuleDefined(name)) {
                    this.moduleManager.addModule(name, dependencies, factory);
                    this.moduleManager.loadRunners();
                }
            }

            amd(name: string, discoverFunc) {
                if (!this.moduleManager.isModuleDefined(name)) {
                    this.discoverAmd(discoverFunc, (dependencies, factory, amdFactory) => {
                        this.moduleManager.addModule(name, dependencies, factory, (def: JsModuleDefinition) => this.writeAmdFactory(amdFactory, def));
                    });
                    this.moduleManager.loadRunners();
                }
            }

            /**
             * Run a module, will execute the code in the module, the module must actually 
             * run some code not just export function for this to have any effect.
             * 
             * Can optionally provide a source, which can be used to filter out running modules at build time
             * for tree shaking.
             */
            run(name: string, source?: string) {
                this.moduleManager.addRunner(name, source);
            }

            debug() {
                this.moduleManager.debug();
            }

            printLoaded() {
                this.moduleManager.printLoaded();
            }

            printUnloaded() {
                this.moduleManager.printUnloaded();
            }

            createFileFromLoaded(ignoredSources?: any[]) {
                return this.moduleManager.createFileFromLoaded(ignoredSources);
            }

            private writeAmdFactory(amdFactory, def: JsModuleDefinition) {
                return 'define("' + def.name + '", ' + def.getDependenciesArg() + ', ' + amdFactory + ');\n'
            }

            private require() {

            }

            private discoverAmd(discoverFunc, callback) {
                var dependencies;
                var factory;
                discoverFunc(function (dep, fac) {
                    dependencies = dep;
                    factory = fac;
                });
                //Remove crap that gets added by tsc (require and exports)
                dependencies.splice(0, 2);

                //Fix up paths, remove leading ./ that tsc likes to add / need
                for (var i = 0; i < dependencies.length; ++i) {
                    var dep = dependencies[i];
                    if (dep[0] === '.' && dep[1] === '/') {
                        dependencies[i] = dep.substring(2);
                    }
                }

                callback(dependencies, function (exports, module, ...args: any[]) {
                    args.unshift(exports);
                    args.unshift(this.require);
                    factory.apply(this, args); //This is a bit weird here, it will be the module instance from the loader, since it sets that before calling this function.
                }, factory);
            }
        }

        //Return the instance
        return new Loader(new ModuleManager(options));
    });

var jsns = jsns || jsnsDefine(jsnsOptions);

function define(name, deps, factory) {
    jsns.amd(name, function (cbDefine) {
        cbDefine(deps, factory);
    });
}