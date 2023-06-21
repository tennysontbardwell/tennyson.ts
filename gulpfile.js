const gulp = require("gulp");
const ts = require("gulp-typescript");
const jest = require("gulp-jest").default;
const del = require("del");
const util = require("util");
const child_process = require("child_process");
const sourcemaps = require('gulp-sourcemaps');
const fs = require('fs');
const process = require('process');

const tsProject = ts.createProject("./tsconfig.json");

function clean() {
    return del('build/**');
};

function buildCompile() {
  return tsProject.src()
    .pipe(sourcemaps.init())
    .pipe(tsProject())
    .pipe(sourcemaps.write())
    .pipe(gulp.dest("build/src"))
};

function test() {
  return gulp.src('.').pipe(jest({
    moduleFileExtensions: ["ts", "js", "json", "jsx", "tsx", "node"],
    modulePaths: ['<rootDir>'],
    testPathIgnorePatterns: ["/node_modules/", "<rootDir>/build/"],
    testEnvironment: "node"
  }))
}

async function badlock() {
  return fs.closeSync(fs.openSync('.lock', 'w'));
}

function unlock() {
  return del('.lock');
};

const build = gulp.series(badlock, buildCompile, test, unlock);

async function poll() {
  return gulp.watch("src/**", build);
}

const watch = gulp.series(build, poll);

exports.watch = watch
exports.build = build
exports.default = build
