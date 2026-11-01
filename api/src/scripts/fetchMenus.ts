// Fetch menus once from the command line: npm --prefix api run fetch-menus [restaurantId]
import { fetchAllMenus } from '../menus/fetcher.ts'

const id = process.argv[2] ? Number(process.argv[2]) : undefined
const results = await fetchAllMenus(id)
console.table(results)
process.exit(0)
