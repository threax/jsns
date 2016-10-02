'use strict';

//This was originally https://github.com/contra/gulp-concat
//Thanks to them I was able to figure out the sourcemaps and figured it was a good starting point.

var through = require('through2');
var path = require('path');
var gutil = require('gulp-util');
var PluginError = gutil.PluginError;
var File = gutil.File;
var Concat = require('concat-with-sourcemaps');
var es = require('event-stream');

// file can be a vinyl file object or a string
// when a string it will construct a new one
module.exports = function (opt) {
    opt = opt || {};

    // to preserve existing |undefined| behaviour and to introduce |newLine: ""| for binaries
    if (typeof opt.newLine !== 'string') {
        opt.newLine = gutil.linefeed;
    }

    var isUsingSourceMaps = false;
    var latestFile;
    var latestMod;
    var concat;

    if (opt['moduleStart'] === undefined) {
        opt.moduleStart = moduleStart;
    }

    if (opt['moduleEnd'] === undefined) {
        opt.moduleEnd = moduleEnd;
    }

    var stream = function (injectMethod) {
        return es.map(function (file, cb) {
            try {

                var usingSrc = false;
                if (file.sourceMap) {
                    usingSrc = true;
                }

                concat = new Concat(usingSrc, file.path + '.out', opt.newLine);

                injectMethod(file, concat);
                file.contents = concat.content;

                if (usingSrc) {
                    file.sourceMap = JSON.parse(concat.sourceMap);
                }

            } catch (err) {
                return cb(new gutil.PluginError('gulp-inject-string', err));
            }
            cb(null, file);
        });
    };

    return stream(function (file, concat) {
        concat.add(null, opt.moduleStart(file, opt));
        concat.add(file.relative, file.contents, file.sourceMap);
        concat.add(null, opt.moduleEnd(file, opt));
    });
};

function moduleStart(file, settings) {
    var parsed = path.parse(file.path);

    var moduleName = parsed.name;

    if (settings['namespace'] !== undefined) {
        if (settings.namespace[settings.namespace.length - 1] !== '.') {
            settings.namespace = settings.namespace + '.';
        }
        moduleName = settings.namespace + moduleName;
    }

    var header;
    if (settings['runners'] !== undefined && settings.runners === true
        || (Array.isArray(settings.runners) && settings.runners.includes(moduleName))) {
        header = 'jsns.runAmd(';
    }
    else {
        header = 'jsns.amd("' + moduleName + '", ';
    }

    header += 'function(define) {\n';
    return header;
}

function moduleEnd(file, settings) {
    return '});';
}