var io = require('threax-npm-tk/io');

(async function(){

    var content = await io.readFile("../node_modules/tslib/tslib.js");
    content = content.toString('utf8');

    content = 'jsns.define("tslib", [], function(module, exports){\nvar define = function(name, deps, fac){fac(exports);};\ndefine.amd = true;\nvar global = module;\n' + content + '\n});';

    await io.writeFile(__dirname + "/../tslib.jsns.js", content);
})();