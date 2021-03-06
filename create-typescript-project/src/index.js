#!/usr/bin/env node
const { program } = require('commander')
const path = require('path')
const fs = require('fs')
const execa = require('execa')
const inquirer = require('inquirer')

const ProjectConfig = {
  projectPath: null,
  projectName: null,
  cwd: null
}

const TemplateFiles = {
  'tsconfig.json': null,
  'webpack.config.js': null,
  'jest.config.js': null
}

async function loadTemplateFiles(){
  for (let key in TemplateFiles) {
    const content = await fs.promises.readFile(path.resolve(__dirname, 'templates', key+'.template'))
    TemplateFiles[key] = content
  }
}

function parseArguments(rawArgs) {
  program
    .argument('<path>', 'Project\'s path')
    .showHelpAfterError("Add --help for more information")
    .parse(rawArgs)
  return program.args
}

function resolveProjectDirectory(projectName){
  const cwd = path.resolve(process.cwd())
  const projectPath = path.resolve(cwd, projectName)
  if (projectPath == cwd) projectName = path.basename(cwd)
  ProjectConfig.cwd = cwd
  ProjectConfig.projectPath = projectPath
  ProjectConfig.projectName = projectName  
}

async function configUi(){
  const config = await inquirer.prompt([
    {
      type: 'confirm',
      message: 'Do you want to install Jest?',
      default: true,
      name: 'jest'
    },
    {
      type: 'confirm',
      message: 'Do you want to bundle your package with Webpack?',
      default: false,
      name: 'webpack'
    },
    {
      type: 'confirm',
      message: 'Do you want to initiate git repository?',
      default: true,
      name: 'git'
    }
  ])
  return config
}

function createProjectDir(p){
  return fs.promises.mkdir(path.resolve(ProjectConfig.projectPath, p))
}
function createProjectFile(filename, content = ''){
  return fs.promises.writeFile(path.resolve(ProjectConfig.projectPath, filename), content)
}
function installYarnPackages(packages, { silent, saveDev } = {}){
  return execCwd('yarn', ['add', (saveDev ? '-D' : ''), ...packages], { pipe: !silent })
}
async function modifyPackageJson(callback) {
  const pathname = path.resolve(ProjectConfig.projectPath, 'package.json')
  const content = await fs.promises.readFile(pathname)
  const json = JSON.parse(content)
  const modifiedJson = callback(json) || json
  const modifiedContent = JSON.stringify(modifiedJson, null, 2)
  await fs.promises.writeFile(pathname, modifiedContent)
}

function execCwd(cmd, args, { pipe } = {}){
  const p = execa(cmd, args, { cwd: ProjectConfig.projectPath })
  if (pipe) p.stdout.pipe(process.stdout)
  return p
}

async function createProject(config){
  if (!fs.existsSync(ProjectConfig.projectPath)) await fs.promises.mkdir(ProjectConfig.projectPath)
  await execCwd(`yarn`, ['init', '-y'], { pipe: true })
  await createProjectDir('src')
  await createProjectFile('src/index.ts', '/* File autogenerated :-) ~xkcm */')
  await createProjectDir('dist')
  const packagesToInstall = [
    'typescript',
    ...(config.jest ? ['ts-jest', 'jest'] : []),
    ...(config.webpack ? ['ts-loader', 'webpack', 'webpack-cli'] : ['tsc'])
  ]
  await installYarnPackages(packagesToInstall, { saveDev: true })
  await createProjectFile('tsconfig.json', TemplateFiles['tsconfig.json'])
  if (config.jest) {
    await createProjectDir('tests')
    await createProjectFile('jest.config.js', TemplateFiles['jest.config.js'])
  }
  if (config.webpack) await createProjectFile('webpack.config.js', TemplateFiles['webpack.config.js'])
  await modifyPackageJson((json) => {
    const BuildCmd = (mode) => config.webpack ? `npx webpack --mode ${mode}` : `npx tsc`
    json.scripts = {
      "test": "npx jest",
      "clear-dist": "rm -rf dist/",
      "build:prod": `yarn clear-dist && ${BuildCmd('production')}`,
      "build:dev": `yarn clear-dist && ${BuildCmd('development')}`,
      "build": "yarn build:dev"
    }
    json.main = "dist/index.js"
    json.types = "dist/index.d.ts"
    json.name = ProjectConfig.projectName
    json.author = {
      name: "xkcm",
      email: "xkcm16+npm@gmail.com"
    }
    json.devDependencies = {...json.devDependencies}
    return Object.assign({
      name: null,
      version: null,
      license: null,
      author: null,
      main: null,
      types: null,
      scripts: null,
      devDependencies: null
    }, json)
  })
  if (config.git) {
    await createProjectFile(
      '.gitignore',
      `node_modules/
      dist/`
    )
    await execCwd('git', ['init'])
    await execCwd('git', ['add', '.'])
    await execCwd('git', ['commit', '-m', '"Initial commit"'])
  }
}

async function cli(rawArgs) {
  await loadTemplateFiles()
  const [projectName] = parseArguments(rawArgs)
  resolveProjectDirectory(projectName)
  const config = await configUi()
  await createProject(config)
}

cli(process.argv)
