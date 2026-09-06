import { PrismaClient } from '@prisma/client'
import { writeFile } from 'node:fs/promises'
import { readIdempotentResult } from '../../src/lib/api-idempotency.ts'

const db = new PrismaClient()
try {
  const result = await readIdempotentResult(db, JSON.parse(process.env.TEST_IDENTITY))
  await writeFile(process.env.TEST_RESULT_FILE, JSON.stringify(result))
} finally {
  await db.$disconnect()
}
