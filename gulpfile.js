/// <binding Clean='clean' ProjectOpened='watchers' />
"use strict";

var gulp = require("gulp"),
    rimraf = require("rimraf"),
    concat = require("gulp-concat"),
    uglify = require("gulp-uglify");

var paths = {
    js: "jsns.js",
    minJs: "jsns.min.js",
    concatJsDest: "jsns.min.js",
};

gulp.task("clean", function (cb) {
    rimraf(paths.concatJsDest, cb);
});

gulp.task("default", function () {
    return gulp.src([paths.js, "!" + paths.minJs], { base: "." })
        .pipe(concat(paths.concatJsDest))
        .pipe(uglify())
        .pipe(gulp.dest("."));
});