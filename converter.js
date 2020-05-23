#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const Hogan = require('hogan.js');
const yamlLint = require('yaml-lint');
const mkdirp = require('mkdirp');

var argv = require('yargs')
    .usage('simplify-converter [options]')
    .string('input')
    .alias('i', 'input')
    .describe('input', 'Input serveless spec YAML or function-arns.txt')
    .string('output')
    .alias('o', 'output')
    .describe('output', 'output directory')
    .default('output', './')
    .boolean('verbose')
    .describe('verbose', 'Increase verbosity')
    .alias('v', 'verbose')
    .demandOption(['i', 'o'])
    .demandCommand(0)
    .argv;

function runCommandLine() {
    try {
        const yamlData = fs.readFileSync(path.resolve(argv.input || 'samples/serverless.yaml'), 'utf8')
        main({}, yamlData)
    } catch(err) {
        console.error(`${err}`)
    }
}

String.prototype.toTextSpace = function () {
    return this.replace(/([A-Z])/g, (match) => ` ${match}`)
        .replace(/^./, (match) => match.toUpperCase())
        .trim()
}

String.prototype.toSnake = function () {
    return this.replace(/([A-Z])/g, (match) => `-${match}`)
        .replace(/^./, (match) => match.toLowerCase())
        .trim().toLowerCase().slice(1)
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

function buildTemplateFile(data, tplFile) {
    const oFile= fs.readFileSync(path.resolve(__dirname, 'templates', tplFile), 'utf8')
    let template = Hogan.compile(oFile);
    return template.render(Object.assign({ ...data }), {});
}

function extractServicePolicy(name, data) {
    let content = buildTemplateFile(data, 'iamrole.mustache')
    let yamlData = yaml.parse(content, { prettyErrors: false })
    yamlData.Properties.PolicyDocument = data
    return yamlData
}

function buildExternalResources(name, resources, iampolicy) {
    let content = buildTemplateFile({}, 'resource.mustache')
    let yamlData = yaml.parse(content, { prettyErrors: false })
    yamlData.Resources = {}
    resources.map(r => {
        yamlData.Resources[`${r.Name}`] = r.Value
        yamlData.Outputs[`${r.Name}`] = { "Value": { "Ref": `${r.Name}` } }
    })
    yamlData.Resources[`${name}IAMPolicy`] = iampolicy
    yamlData.Outputs[`${name}IAMPolicy`] = { "Value": { "Ref": `${name}IAMPolicy` } }
    return yamlData
}

function writeTemplateFile(tplFile, data, outputPath, file) {
    const dataFile = buildTemplateFile(data, tplFile)
    var filename = path.join(outputPath, file)
    if (!fs.existsSync(outputPath)) {
        mkdirp.sync(outputPath);
    }
    fs.writeFileSync(filename, dataFile, 'utf8');
}

function writeYAMLFile(rName, data, output, location) {
    var rYaml = yaml.parse(JSON.stringify(data), { prettyErrors: false });
    var filePath = path.join(output, location || '')
    var filename = path.resolve(filePath, rName)
    if (!fs.existsSync(filePath)) {
        mkdirp.sync(filePath);
    }
    fs.writeFileSync(filename, yaml.stringify(rYaml), 'utf8');
}

function getProjectInfo(o) {
    return {
        ProjectDesc: o.service.toPascalCase().toTextSpace(),
        ProjectName: o.service.toPascalCase(),
        DeploymentName: o.service.toPascalCase() + "Demo",
        DeploymentRegion: "eu-west-1",
        DeploymentProfile: "simplify-eu"
    }
}

function main(config, specs) {
    let o = yaml.parse(specs, { prettyErrors: false });
    if (argv.verbose) console.log(`Loaded definition:`, o.functions);
    config = { ...config, ...getProjectInfo(o) }
    var Resources = []
    Object.keys(o.resources.Resources).map(function (k) {
        Resources.push({ Value: o.resources.Resources[k], Name: k })
    })
    const IAMRolePolicy = extractServicePolicy(config.ProjectName, o.provider.iamRoleStatements)
    const externalResource = buildExternalResources(config.ProjectName, Resources, IAMRolePolicy)
    
    console.log(" - Working for External Resources...")
    writeYAMLFile(`${config.ProjectName}.yaml`, externalResource, argv.output, 'resources')
    const outputFile = path.join(argv.output, "resources")
    writeTemplateFile("package.mustache", { ProjectNameSnake: config.ProjectName.toPascalCase().toSnake() }, outputFile, "package.json")
    writeTemplateFile("resource-create.mustache", {
        ProjectName: config.ProjectName,
        ProjectNameSnake: config.ProjectName.toSnake(),
        GeneratorVersion: require('./package.json').version,
    }, outputFile, "resource-create.js")
    writeTemplateFile("resource-input.mustache", {
        ProjectName: config.ProjectName,
        ProjectNameSnake: config.ProjectName.toSnake(),
        GeneratorVersion: require('./package.json').version,
        ...config
    }, outputFile, "resource-input.json")

    console.log(" - Working for OpenAPI 3.0 Specs...")
    var ResourcePaths = {}
    Object.keys(o.functions).map(function (k) {
        if (o.functions[k].events) {
            o.functions[k].events.map(function (evt) {
                var service = { ServicePublic: false }
                if (evt.http) {
                    service.ResourceType = 'x-api'
                    service.ServicePublic = true
                    service.ServiceType = 'rest-api'
                    service.ServiceTemplate = 'flatted'
                    service.ServiceName = k.toPascalCase().toSnake() + '-' + service.ServiceType
                    service.ResourcePath = service.ResourcePath || evt.http.path.toLowerCase()
                    service.ResourceMethod = service.ResourceMethod || evt.http.method.toLowerCase()                    
                } else if (evt.schedule) {
                    service.ResourceType = 'x-event'
                    service.ResourceMethod = 'patch'
                    service.ServiceTemplate = 'flatted'
                    service.ServiceType = 'event-rule'
                    service.ServiceSchedule = evt.schedule
                    service.ServiceName = k.toPascalCase().toSnake() + '-' + service.ServiceType
                    service.ResourcePath = k.toPascalCase().toSnake() + '/' + service.ServiceType
                } else {
                    service.ResourceType = 'x-event'
                    service.ResourceMethod = 'patch'
                    service.ServiceTemplate = 'flatted'
                    service.ServiceType = Object.keys(evt)[0].toPascalCase().toSnake()
                    service.ServiceName = k.toPascalCase().toSnake() + '-' + service.ServiceType
                    service.ResourcePath = k.toPascalCase().toSnake() + '/' + service.ServiceType
                    service.ServiceTags = evt[Object.keys(evt)[0]]
                    service.HasServiceTags = true
                    if (typeof service.ServiceTags === 'object') {
                        if (Array.isArray(service.ServiceTags)) {
                            service.ServiceTags = service.ServiceTags.map((tag, idx) => {
                                const value = Object.keys(tag).map(k => {
                                    return `${k}(${tag[k]})`
                                })
                                return { ServiceTag: `Name=${idx},Value=${value}` }
                            })
                        } else {
                            service.ServiceTags = Object.keys(service.ServiceTags).map(k => {
                                return { ServiceTag: `Name=${k},Value=${service.ServiceTags[k]}` }
                            })
                        }
                    } else {
                        service.ServiceTags = [{ ServiceTag: service.ServiceTags }]
                    }
                }
                service.ServicePolicy = o.iamRoleStatements
                service.ServiceRuntime = o.provider.runtime || 'nodejs12.x'
                service.OperationName = service.OperationName || k.toCamelCase()
                service.Description = service.OperationName.toPascalCase().toTextSpace()
                if (!ResourcePaths[service.ResourcePath]) {
                    ResourcePaths[service.ResourcePath] = []
                }
                ResourcePaths[service.ResourcePath].push(service)
            })
        }
    })
    const oYAML = fs.readFileSync(path.resolve(__dirname, 'templates', 'openapi.mustache'), 'utf8')
    let template = Hogan.compile(oYAML);
    let content = template.render(Object.assign({}, { ResourcePaths: convertResources(ResourcePaths) }, config), {});

    if (!fs.existsSync(argv.output)) {
        mkdirp.sync(argv.output);
    }
    var filename = path.resolve(path.join(argv.output, 'openapi.yaml'))
    fs.writeFileSync(filename, content, 'utf8');
    yamlLint.lint(content).then(() => {
        console.log(`${filename} is a valid YAML file.`);
    }).catch((error) => {
        console.error(`Invalid YAML file ${error}.`);
    });
}

runCommandLine()