interface ModuleDefFunc {

};

class JsModuleStatus {
    private loadingDelayed = false;
    private name: string;

    constructor(name: string, private loader: ModuleManager){
    
    }

    public exports: any = {};

    /**
     * Figure out if this module is delay loading.
     * @returns {bool} True if delay loading, false if fully loaded
     */
    isLoadingDelayed () {
        return this.loadingDelayed;
    }

    /**
     * Set this module to delay loading mode, you must call setLoaded manually
     * after calling this function or the module will never be considered loaded.
     * Do this if you need additional async calls to fully load your module.
     */
    delayLoading () {
        this.loadingDelayed = true;
    }

    /**
     * Set the module to loaded. Only needs to be called if delayLoading is called,
     * otherwise there is no need.
     */
    loaded() {
        this.loader.setModuleLoaded(name, this);
        this.loader.loadRunners();
    }
}

class JsModule{
    name: string;
    factory;
    dependencies = [];

    constructor(name: string, depNames: string[], factory, loader: ModuleManager) {
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
}

interface Map<T> {
    [key: string]: T;
}

class ModuleManager {
    private loaded: Map<JsModuleStatus> = {};
    private unloaded: Map<JsModule> = {};
    private runners: JsModule[] = [];
    private runBlockers = [];

    addRunner(dependencies: string[], factory) {
        this.runners.push(new JsModule("Runner", dependencies, factory, this));
    }

    addModule(name: string, dependencies: string[], factory) {
        this.unloaded[name] = new JsModule(name, dependencies, factory, this);
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

    setModuleLoaded(name: string, module: JsModuleStatus) {
        if (this.loaded[name] === undefined) {
            this.loaded[name] = module;
        }
    }

    checkModule(check: JsModule) {
        var dependencies = check.dependencies;
        var fullyLoaded = true;
        var module = undefined;

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
            module = new JsModuleStatus(check.name, this);
            var args = [module.exports, module];

            //Inject dependency arguments
            for (var i = 0; i < dependencies.length; ++i) {
                var dep = dependencies[i];
                args.push(this.loaded[dep.name].exports);
            }

            check.factory.apply(module, args);

            if (!module.isLoadingDelayed()) {
                this.setModuleLoaded(check.name, module);
            }
        }

        return fullyLoaded && !module.isLoadingDelayed();
    }

    loadRunners() {
        if (this.runBlockers.length === 0) { //If there are any run blockers, do nothing
            for (var i = 0; i < this.runners.length; ++i) {
                var runner = this.runners[i];
                if (this.checkModule(runner)) {
                    this.runners.splice(i--, 1);
                }
            }
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

    private require() {

    }

    discoverAmd(discoverFunc, callback) {
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
            factory.apply(this, args);
        });
    }

    addRunnerBlocker(blockerName) {
        this.runBlockers.push(blockerName);
    }

    /**
     * Remove a runner blocker, returns true if all blockers are removed, and false if they are not.
     * @param blockerName
     */
    removeRunnerBlocker(blockerName: string) {
        var index = this.runBlockers.indexOf(blockerName);
        if (index !== -1) {
            this.runBlockers.splice(index, 1);
            return true;
        }
        return false;
    }
}

class Loader {
    private moduleManager = new ModuleManager();

    run(dependencies, factory) {
        this.moduleManager.addRunner(dependencies, factory);
        this.moduleManager.loadRunners();
    }

    define(name, dependencies, factory) {
        if (!this.moduleManager.isModuleDefined(name)) {
            this.moduleManager.addModule(name, dependencies, factory);
            this.moduleManager.loadRunners();
        }
    }

    amd(name, discoverFunc) {
        if (!this.moduleManager.isModuleDefined(name)) {
            this.moduleManager.discoverAmd(discoverFunc, (dependencies, factory) => {
                this.define(name, dependencies, factory);
            });
            this.moduleManager.loadRunners();
        }
    }

    runAmd(discoverFunc) {
        this.moduleManager.discoverAmd(discoverFunc, (dependencies, factory) => {
            this.run(dependencies, factory);
        });
        this.moduleManager.loadRunners();
    }

    runNamedAmd(name) {
        this.run([name], () => { }); //Load the dependency and then do an empty function to simulate a runner.
    }

    addRunnerBlocker(blockerName: string) {
        this.moduleManager.addRunnerBlocker(blockerName);
    }

    removeRunnerBlocker(blockerName: string) {
        if (this.moduleManager.removeRunnerBlocker(blockerName)) {
            this.moduleManager.loadRunners();
        }
    }

    debug() {
        this.moduleManager.debug();
    }
}

var jsns: Loader = jsns || new Loader();

function define(name, deps, factory) {
    jsns.amd(name, function (cbDefine) {
        cbDefine(deps, factory);
    });
}