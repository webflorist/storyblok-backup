#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'fs'
import minimist from 'minimist'
import StoryblokClient from 'storyblok-js-client'
import { performance } from 'perf_hooks'
import dotenvx from '@dotenvx/dotenvx'

const startTime = performance.now()

dotenvx.config({ quiet: true })

const resourceTypes = [
	'story',
	'collaborator',
	'component',
	'component-group',
	'asset',
	'asset-folder',
	'internal-tag',
	'datasource',
	'datasource-entries',
	'space',
	'space-role',
	'task',
	'preset',
	// 'field-type',
	'webhook',
	'workflow',
	'workflow-stage',
	'release',
	'pipeline-branch',
	'access-token',
]

const args = minimist(process.argv.slice(2))

if ('help' in args) {
	console.log(`USAGE
  $ npx storyblok-restore
  
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
  --type <type>       (required) Type of resource to restore. Possible values are:
                      - '${resourceTypes.join("'\n                      - '")}'
  --file <file>       (required) File of resource to restore.
  --publish           Perform a publish after restore of a story (default=false).
  --create            Create a new resource instead of updating (default=false).
                      Not supported for assets.
  --id <file>         (required if type=datasource-entries and create is set)
                      ID of datasource the entries belong to.
  --verbose           Will show detailed result of the restore process.
  --help              Show this help

MINIMAL EXAMPLE
  $ npx storyblok-restore --token 1234567890abcdef --space 12345 --type story --file ./.output/backup/123456789.json

MAXIMAL EXAMPLE
  $ npx storyblok-restore \\
      --token 1234567890abcdef \\
      --space 12345 \\
      --region ap \\
      --type story \\
      --file ./.output/backup/123456789.json \\
      --publish \\
      --create \\
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

if (!('type' in args)) {
	console.log(
		'Error: State the resource type to restore via the --type argument. Use --help to find out more.'
	)
	process.exit(1)
}

if (!resourceTypes.includes(args.type)) {
	console.log(`Error: Invalid resource type "${args.type}". Use --help to find out more.`)
	process.exit(1)
}

if (!('file' in args)) {
	console.log(
		'Error: State the resource file to restore via the --file argument. Use --help to find out more.'
	)
	process.exit(1)
}

if (!fs.existsSync(args.file)) {
	console.log(`Error: Stated file "${args.file}" does not exist.`)
	process.exit(1)
}

const verbose = 'verbose' in args

const publish = 'publish' in args

const create = 'create' in args

// Init Management API
const StoryblokMAPI = new StoryblokClient({
	oauthToken: oauthToken,
	region: region,
})

// Function to perform a default single resource restore
const defaultSingleRestore = async (type, id, params) => {
	if (publish) {
		params.publish = 1
	}
	let url = `spaces`

	if (!(create && args.type === 'space')) {
		url = `${url}/${spaceId}`
	}

	if (type) {
		url = `${url}/${type}`
	}

	if (create) {
		await StoryblokMAPI.post(url, params)
			.then((response) => {
				console.log(`Created "${type}" resource.`)
				if (verbose) {
					console.log('Result:')
					console.log(response.data)
				}
			})
			.catch((error) => {
				throw error
			})
	} else {
		if (id) {
			url = `${url}/${id}`
		}
		await StoryblokMAPI.put(url, params)
			.then((response) => {
				console.log(`Updated "${type}" resource with id "${id}".`)
				if (verbose) {
					console.log('Result:')
					console.log(response.data)
				}
			})
			.catch((error) => {
				throw error
			})
	}
}

const resource = JSON.parse(fs.readFileSync(args.file, 'utf8'))

switch (args.type) {
	case 'story':
		delete resource.updated_at
		await defaultSingleRestore('stories', resource.id, { story: resource })
		break
	case 'collaborator':
		await defaultSingleRestore(
			'collaborators',
			resource.id,
			create
				? {
						email: resource.user.userid,
						role: resource.role,
						space_id: resource.space_id,
						permissions: resource.permissions,
						space_role_ids: resource.space_role_ids,
						allow_multiple_roles_creation: resource.role === 'multi',
					}
				: { collaborator: resource }
		)
		break
	case 'component':
		await defaultSingleRestore('components', resource.id, { component: resource })
		break
	case 'component-group':
		await defaultSingleRestore('component_groups', resource.id, { component_group: resource })
		break
	case 'asset':
		if (create) {
			console.log('Error: Creating assets is not supported.')
			process.exit(1)
		}
		await defaultSingleRestore('assets', resource.id, { asset: resource })
		break
	case 'asset-folder':
		await defaultSingleRestore('asset_folders', resource.id, { asset_folder: resource })
		break
	case 'internal-tag':
		await defaultSingleRestore('internal_tags', resource.id, { internal_tag: resource })
		break
	case 'datasource':
		await defaultSingleRestore('datasources', resource.id, { datasource: resource })
		break
	case 'datasource-entries':
		if (create && !('id' in args)) {
			console.log(
				'Error: State the datasource ID via the --id argument. Use --help to find out more.'
			)
			process.exit(1)
		}
		for (const entry of resource) {
			if (create) {
				entry.datasource_id = args.id
			}
			await defaultSingleRestore('datasource_entries', entry.id, {
				datasource_entry: entry,
			})
		}
		break
	case 'space':
		await defaultSingleRestore(null, null, { space: resource })
		break
	case 'space-role':
		await defaultSingleRestore('space_roles', resource.id, { space_role: resource })
		break
	case 'task':
		await defaultSingleRestore('tasks', resource.id, { task: resource })
		break
	case 'preset':
		await defaultSingleRestore('presets', resource.id, { preset: resource })
		break
	case 'webhook':
		await defaultSingleRestore('webhook_endpoints', resource.id, { webhook_endpoint: resource })
		break
	case 'workflow':
		await defaultSingleRestore('workflows', resource.id, { workflow: resource })
		break
	case 'workflow-stage':
		await defaultSingleRestore('workflow_stages', resource.id, { workflow_stage: resource })
		break
	case 'release':
		await defaultSingleRestore('releases', resource.id, { release: resource })
		break
	case 'pipeline-branch':
		await defaultSingleRestore('branches', resource.id, { branch: resource })
		break
	case 'access-token':
		if (create) {
			console.log(
				'Error: Creating access-tokens from backup is not possible, since it will result in a new token.'
			)
			process.exit(1)
		}
		await defaultSingleRestore('api_keys', resource.id, { api_key: resource })
		break
}

const endTime = performance.now()

console.log(`Restore successful in ${Math.round((endTime - startTime) / 1000)} seconds.`)
process.exit(0)
