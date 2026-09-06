import { pluginTaxonomyRoutes } from '@/lib/plugin-taxonomies'

const routes = pluginTaxonomyRoutes('categories')
export const GET = routes.list
export const POST = routes.create
