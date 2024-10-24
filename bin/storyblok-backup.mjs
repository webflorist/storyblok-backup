#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'fs'
import { Readable } from 'stream'
import { finished } from 'stream/promises'
import zipLib from 'zip-lib'
import minimist from 'minimist'
import StoryblokClient from 'storyblok-js-client'
import { performance } from 'perf_hooks'
import dotenvx from '@dotenvx/dotenvx'

const startTime = performance.now()

dotenvx.config({ quiet: true })

let resourceTypes = [
	'stories',
	'collaborators',
	'components',
	'component-groups',
	'assets',
	'asset-folders',
	'internal-tags',
	'datasources',
	'space',
	'space-roles',
	'tasks',
	'activities',
	'presets',
	'field-types',
	'webhooks',
	'workflow-stages',
	'workflow-stage-changes',
	'workflows',
	'releases',
	'pipeline-branches',
	'access-tokens',
]

const args = minimist(process.argv.slice(2))

if ('help' in args) {
	console.log(`USAGE
  $ npx storyblok-backup
  
OPTIONS
  --token <token>     (required) Personal OAuth access token created
                      in the account settings of a Stoyblok user.
                      (NOT the Access Token of a Space!)
                      Alternatively, you can set the STORYBLOK_OAUTH_TOKEN environment variable.
  --space <space_id>  (required) ID of the space to backup
                      Alternatively, you can set the STORYBLOK_SPACE_ID environment variable.
  --region <region>   Region of the space. Possible values are:
                      - 'eu' (default): EU
                      - 'us': US
                      - 'ap': Australia
                      - 'ca': Canada
                      - 'cn': China
                      Alternatively, you can set the STORYBLOK_REGION environment variable.
  --types <types>     Comma separated list of resource-types to backup. Defaults to all.
                      Possible values are:
                      - '${resourceTypes.join("'\n                      - '")}'
  --with-asset-files  Downloads all files (assets) of the space. Defaults to false.
  --output-dir <dir>  Directory to write the backup to. Defaults to ./.output
                      (ATTENTION: Will fail if the directory already exists!)
  --force             Force deletion and recreation of existing output directory.
  --create-zip        Create a zip file of the backup. Defaults to false.
  --zip-prefix <dir>  Prefix for the zip file. Defaults to 'backup'.
                      (The suffix will automatically be the current date.)
  --verbose           Will show detailed output for every file written.
  --help              Show this help

MINIMAL EXAMPLE
  $ npx storyblok-backup --token 1234567890abcdef --space 12345

MAXIMAL EXAMPLE
  $ npx storyblok-backup \\
      --token 1234567890abcdef \\
      --space 12345 \\
      --region ap \\
      --types "stories,components" \\
      --with-asset-files \\
      --output-dir ./my-dir \\
      --force \\
      --create-zip \\
      --zip-prefix daily \\
      --verbose
`)
	process.exit(0)
}

if (!('token' in args) && !process.env.STORYBLOK_OAUTH_TOKEN) {
	console.log(
		'Error: State your oauth token via the --token argument or the environment variable STORYBLOK_OAUTH_TOKEN. Use --help to find out more.'
	)
	process.exit(1)
}
const oauthToken = args.token || process.env.STORYBLOK_OAUTH_TOKEN

if (!('space' in args) && !process.env.STORYBLOK_SPACE_ID) {
	console.log(
		'Error: State your space id via the --space argument or the environment variable STORYBLOK_SPACE_ID. Use --help to find out more.'
	)
	process.exit(1)
}
const spaceId = args.space || process.env.STORYBLOK_SPACE_ID

let region = 'eu'
if ('region' in args || process.env.STORYBLOK_REGION) {
	region = args.region || process.env.STORYBLOK_REGION

	if (!['eu', 'us', 'ap', 'ca', 'cn'].includes(region)) {
		console.log('Error: Invalid region parameter stated. Use --help to find out more.')
		process.exit(1)
	}
}

if ('types' in args) {
	const typesToBackup = args.types.split(',')
	for (const type of typesToBackup) {
		if (!resourceTypes.includes(type)) {
			console.log(
				`Error: Invalid type parameter stated. "${type}" is not a valid resource type. Use --help to find out more.`
			)
			process.exit(1)
		}
	}
	resourceTypes = typesToBackup
}

const verbose = 'verbose' in args

const outputDir = args['output-dir'] || './.output'

const backupDir = `${outputDir}/backup`

if (fs.existsSync(outputDir) && !('force' in args)) {
	console.log(
		`Error: Output directory "${outputDir}" already exists. Use --force to delete and recreate it (POSSIBLY DANGEROUS!).`
	)
	process.exit(1)
}

const filePrefix = args['zip-prefix'] || 'backup'

const fileName =
	[
		filePrefix,
		new Date().getFullYear(),
		(new Date().getMonth() + 1).toString().padStart(2, '0'),
		new Date().getDate().toString().padStart(2, '0'),
		new Date().getHours().toString().padStart(2, '0'),
		new Date().getMinutes().toString().padStart(2, '0'),
		new Date().getSeconds().toString().padStart(2, '0'),
	].join('-') + '.zip'

const filePath = `${outputDir}/${fileName}`

console.log(`Creating backup for space ${spaceId}:`)
console.log(`Output dir: ${outputDir}`)
if ('create-zip' in args) {
	console.log(`Output zip: ${filePath}`)
}

// Init Management API
const StoryblokMAPI = new StoryblokClient({
	oauthToken: oauthToken,
	region: region,
})

// Remove existing output directory
if (fs.existsSync(outputDir)) {
	fs.rmSync(outputDir, { recursive: true, force: true })
}

// Create output directories (except for space, since this json will be saved in the root)
fs.mkdirSync(backupDir, { recursive: true })
resourceTypes.forEach(
	(resource) => resource === 'space' || fs.mkdirSync(`${backupDir}/${resource}`)
)

// Function to perform a default fetch
const defaultFetch = async (endpoint, type, fileField, fileFieldObject) => {
	if (resourceTypes.includes(type)) {
		console.log(`Fetching ${type}`)
		await StoryblokMAPI.getAll(`spaces/${spaceId}/${endpoint}`)
			.then((items) => {
				items.forEach((item) =>
					writeJson(
						type,
						fileFieldObject ? item[fileFieldObject][fileField] : item[fileField],
						item
					)
				)
			})
			.catch((error) => {
				throw error
			})
	}
}

// Function to write a file
const writeJson = (folder, file, content) => {
	let outputFile = backupDir
	if (folder !== null) {
		outputFile += `/${folder}`
	}
	outputFile += `/${file}.json`
	fs.writeFileSync(outputFile, JSON.stringify(content, null, 2), (error) => {
		if (error) {
			throw error
		}
	})
	if (verbose) console.log(`Written file ${outputFile}`)
}

// Function to download a file
const downloadFile = async (type, name, url) => {
	const res = await fetch(url)
	const outputFile = `${backupDir}/${type}/${name}`
	const fileStream = fs.createWriteStream(outputFile, { flags: 'wx' })
	await finished(Readable.fromWeb(res.body).pipe(fileStream))
	if (verbose) console.log(`Written file ${outputFile}`)
}

// Fetch space info
if (resourceTypes.includes('space')) {
	console.log(`Fetching space`)
	await StoryblokMAPI.get(`spaces/${spaceId}/`)
		.then((space) => {
			writeJson(null, `space-${spaceId}`, space.data.space)
		})
		.catch((error) => {
			throw error
		})
}

// Fetch all stories
if (resourceTypes.includes('stories')) {
	console.log(`Fetching stories`)
	await StoryblokMAPI.getAll(`spaces/${spaceId}/stories`)
		.then(async (stories) => {
			for (const story of stories) {
				await StoryblokMAPI.get(`spaces/${spaceId}/stories/${story.id}`)
					.then((response) => {
						delete response.data.story.preview_token
						writeJson('stories', story.id, response.data.story)
					})
					.catch((error) => {
						throw error
					})
			}
		})
		.catch((error) => {
			throw error
		})
}

// Fetch all collaborators
await defaultFetch('collaborators', 'collaborators', 'user_id')

// Fetch all components
await defaultFetch('components', 'components', 'name')

// Fetch all component-groups
await defaultFetch('component_groups', 'component-groups', 'id')

// Fetch all assets (including files)
if (resourceTypes.includes('assets')) {
	console.log(`Fetching assets`)
	await StoryblokMAPI.getAll(`spaces/${spaceId}/assets`)
		.then(async (assets) => {
			for (const asset of assets) {
				writeJson('assets', asset.id, asset)
				if ('with-asset-files' in args) {
					const fileExtension = asset.filename.split('.').at(-1)
					const fileName = asset.id + '.' + fileExtension
					await downloadFile('assets', fileName, asset.filename)
				}
			}
		})
		.catch((error) => {
			throw error
		})
}

// Fetch all asset-folders
await defaultFetch('asset_folders', 'asset-folders', 'id')

// Fetch all internal-tags
await defaultFetch('internal_tags', 'internal-tags', 'id')

// Fetch all datasources (including entries)
if (resourceTypes.includes('datasources')) {
	console.log(`Fetching datasources`)
	await StoryblokMAPI.getAll(`spaces/${spaceId}/datasources`)
		.then(async (datasources) => {
			for (const datasource of datasources) {
				writeJson('datasources', datasource.id, datasource)
				await StoryblokMAPI.getAll(`spaces/${spaceId}/datasource_entries`, {
					datasource_id: datasource.id,
				})
					.then((dateSourceEntries) =>
						writeJson('datasources', datasource.id + '_entries', dateSourceEntries)
					)
					.catch((error) => {
						throw error
					})
			}
		})
		.catch((error) => {
			throw error
		})
}

// Fetch all space roles
await defaultFetch('space_roles', 'space-roles', 'id')

// Fetch all tasks
await defaultFetch('tasks', 'tasks', 'id')

// Fetch all activities
await defaultFetch('activities', 'activities', 'id', 'activity')

// Fetch all presets
await defaultFetch('presets', 'presets', 'id')

// Fetch all field-types
await defaultFetch('field_types', 'field-types', 'name')

// Fetch all webhooks
await defaultFetch('webhook_endpoints', 'webhooks', 'id')

// Fetch all workflow-stages
await defaultFetch('workflow_stages', 'workflow-stages', 'id')

// Fetch all workflow-stage-changes
await defaultFetch('workflow_stage_changes', 'workflow-stage-changes', 'id')

// Fetch all workflows
await defaultFetch('workflows', 'workflows', 'id')

// Fetch all releases
await defaultFetch('releases', 'releases', 'id')

// Fetch all pipeline branches
await defaultFetch('branches', 'pipeline-branches', 'id')

// Fetch all access tokens
await defaultFetch('api_keys', 'access-tokens', 'id')

// Create zip file
if ('create-zip' in args) {
	console.log(`Creating zip file`)
	await zipLib
		.archiveFolder(backupDir, filePath)
		.then(
			function () {
				console.log(`Backup file '${filePath}' successfully created.`)
			},
			function (err) {
				throw err
			}
		)
		.catch((error) => {
			throw error
		})
}

const endTime = performance.now()

console.log(`Backup successfully created in ${Math.round((endTime - startTime) / 1000)} seconds.`)
process.exit(0)
