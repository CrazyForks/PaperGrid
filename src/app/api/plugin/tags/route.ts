import { pluginTaxonomyRoutes } from '@/lib/plugin-taxonomies'

const routes = pluginTaxonomyRoutes('tags')
export const GET = routes.list
export const POST = routes.create
