const asar = require('asar')
const fs = require('fs')
const glob = require('glob')
const mkdirp = require('mkdirp')
const path = require('path')
const {Collector, Instrumenter, Reporter} = require('istanbul')

const outputPath = path.join(__dirname, '..', '..', 'out', 'coverage')
const libPath = path.join(__dirname, '..', '..', 'lib')

// Add unrequired files to the coverage report so all files are present there
const addUnrequiredFiles = (coverage) => {
  const instrumenter = new Instrumenter()
  const libPath = path.join(__dirname, '..', '..', 'lib')

  glob.sync('**/*.js', {cwd: libPath}).map(function (relativePath) {
    return path.join(libPath, relativePath)
  }).filter(function (filePath) {
    return coverage[filePath] == null
  }).forEach(function (filePath) {
    instrumenter.instrumentSync(fs.readFileSync(filePath, 'utf8'), filePath)

    // When instrumenting the code, istanbul will give each FunctionDeclaration
    // a value of 1 in coverState.s,presumably to compensate for function
    // hoisting. We need to reset this, as the function was not hoisted, as it
    // was never loaded.
    Object.keys(instrumenter.coverState.s).forEach(function (key) {
        instrumenter.coverState.s[key] = 0
    });

    coverage[filePath] = instrumenter.coverState
  })
}

// Generate a code coverage report in out/coverage/lcov-report
exports.generate = () => {
  const coverage = window.__coverage__
  if (coverage == null) return

  addUnrequiredFiles(coverage)

  const collector = new Collector()
  collector.add(coverage)

  const {ipcRenderer} = require('electron')
  collector.add(ipcRenderer.sendSync('get-coverage'))

  const reporter = new Reporter(null, outputPath)
  reporter.addAll(['text', 'lcov'])
  reporter.write(collector, true, function () {})
}

// Generate an instrumented .asar file for all the files in lib/ and save it
// to out/coverage/electron-instrumented.asar
exports.instrument = () => {
  const instrumenter = new Instrumenter()

  glob.sync('**/*.js', {cwd: libPath}).forEach(function (relativePath) {
    const rawPath = path.join(libPath, relativePath)
    const raw = fs.readFileSync(rawPath, 'utf8')

    const generatedPath = path.join(outputPath, 'lib', relativePath)
    const generated = instrumenter.instrumentSync(raw, rawPath)
    mkdirp.sync(path.dirname(generatedPath))
    fs.writeFileSync(generatedPath, generated)
  })

  const asarPath = path.join(outputPath, 'electron-instrumented.asar')
  asar.createPackageWithOptions(path.join(outputPath, 'lib'), asarPath, {}, function (error) {
    if (error) {
      console.error(error.stack || error)
      process.exit(1)
    }
  })
}
