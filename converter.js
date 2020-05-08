#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const Hogan = require('hogan.js');
const yamlLint = require('yaml-lint');
const mkdirp = require('mkdirp');

var argv = require('yargs')
    .usage('simplify-converter serverless|openapi [options]')
    .string('config')
    .alias('c', 'config')
    .describe('config', 'YAML configuration mapping template')
    .string('serverless')
    .alias('i', 'serverless')
    .describe('serverless', 'Serverless spec file in YAML')
    .string('output')
    .alias('o', 'output')
    .describe('output', 'output directory')
    .default('output', './output')
    .boolean('verbose')
    .describe('verbose', 'Increase verbosity')
    .alias('v', 'verbose')
    .demandOption(['i', 'o'])
    .demandCommand(1)
    .argv;

function runCommandLine() {
    const cfgYAML = fs.readFileSync(path.resolve(argv.config || 'specs/config.yaml'), 'utf8')
    let config = yaml.parse(cfgYAML, { prettyErrors: false });
    main(config, fs.readFileSync(path.resolve(argv.serverless || 'specs/serverless.yaml'), 'utf8'))
}

String.prototype.toTextSpace = function () {
    return this.replace(/([A-Z])/g, (match) => ` ${match}`)
        .replace(/^./, (match) => match.toUpperCase())
        .trim()
}

String.prototype.toCamelCase = function () {
    return this.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '').split(' ').join('').split('-').join('');
};

String.prototype.toPascalCase = function () {
    return this
        .replace(new RegExp(/[-_]+/, 'g'), ' ')
        .replace(new RegExp(/[^\w\s]/, 'g'), '')
        .replace(
            new RegExp(/\s+(.)(\w+)/, 'g'),
            ($1, $2, $3) => `${$2.toUpperCase() + $3.toLowerCase()}`
        )
        .replace(new RegExp(/\s/, 'g'), '')
        .replace(new RegExp(/\w/), s => s.toUpperCase()).split(' ').join('').split('-').join('');
};

function convertArray(arr) {
    if (!arr) arr = [];
    if (arr.length) {
        arr.isEmpty = false;
        for (let i = 0; i < arr.length; i++) {
            arr[i]['-first'] = (i === 0);
            arr[i]['-last'] = (i === arr.length - 1);
            arr[i].hasMore = (i < arr.length - 1);
        }
    }
    else arr.isEmpty = true;
    arr.toString = function () { if (arrayMode === 'length') return this.length.toString() };
    return arr;
}

function convertResources(obj) {
    var arr = [];
    Object.keys(obj).map(function (k, i) {
        arr.push({
            ResourcePath: k,
            ResourceData: convertArray(obj[k])
        })
    })
    return arr;
}

function main(config, specs) {
    let o = yaml.parse(specs, { prettyErrors: false });
    if (argv.verbose) console.log(`Loaded ${argv._[0]} definition:`, o.functions);
    function getMappingFunction(config, f) {
        return config.Mappings.Functions[f]
    }
    var globalResources = []
    Object.keys(o.resources.Resources).map(function (k) {
        var rName = k + '.yaml';
        var rYaml = yaml.parse(JSON.stringify(o.resources.Resources[k]), { prettyErrors: false });
        var filePath = path.join(argv.output, 'resources')
        var filename = path.resolve(filePath, rName)
        if (!fs.existsSync(filePath)) {
            mkdirp.sync(filePath);
        }
        console.log("Generating Resource Specs...", filename)
        fs.writeFileSync(filename, yaml.stringify(rYaml), 'utf8');
        globalResources.push({ Value: path.join(argv.output, 'resources', rName) })
    })
    var ResourcePaths = {}
    Object.keys(o.functions).map(function (k) {
        if (o.functions[k].events) {
            var service = getMappingFunction(config, k)
            if (service) {
                o.functions[k].events.map(function (evt) {
                    if (evt.http) {
                        service.ResourceType = 'x-api'
                        service.ServiceRuntime = o.provider.runtime || 'nodejs12.x'
                        service.ResourcePath = service.ResourcePath || evt.http.path.toLowerCase()
                        service.ResourceMethod = service.ResourceMethod || evt.http.method.toLowerCase()
                        service.OperationName = service.OperationName || k.toCamelCase()
                        service.Description = service.OperationName.toTextSpace()
                        service.hasServiceResource = service.ServiceResources ? true : false
                        service.hasServicePolicy = service.ServicePolicies ? true : false
                        if (!ResourcePaths[service.ResourcePath]) {
                            ResourcePaths[service.ResourcePath] = []
                        }
                        ResourcePaths[service.ResourcePath].push(service)
                    }
                })
            }
        }
    })
    const oYAML = fs.readFileSync(path.resolve(__dirname, 'openapi.mustache'), 'utf8')
    let template = Hogan.compile(oYAML);
    let content = template.render(Object.assign({
        GlobalResources: globalResources,
        hasGlobalResource: globalResources.length > 0 ? true: false
    }, { ResourcePaths: convertResources(ResourcePaths) }, config), {});

    if (!fs.existsSync(argv.output)) {
        mkdirp.sync(argv.output);
    }
    var filename = path.resolve(path.join(argv.output, 'openapi.yaml'))
    console.log("Generating OpenAPI Specs...", filename)
    fs.writeFileSync(filename, content, 'utf8');
    yamlLint.lint(content).then(() => {
        console.log(`${filename} is a valid YAML file.`);
    }).catch((error) => {
        console.error(`Invalid YAML file ${error}.`);
    });
}

runCommandLine()