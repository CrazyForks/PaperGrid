import { pluginTaxonomyRoutes } from '@/lib/plugin-taxonomies'

const routes = pluginTaxonomyRoutes('tags')
export const GET = routes.get
export const PATCH = routes.update
export const DELETE = routes.delete
