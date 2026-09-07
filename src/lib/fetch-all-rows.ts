/** Read every page, including when the API caps responses below our page size. */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>,
) {
  const rows: T[] = []
  for (;;) {
    const { data, error } = await fetchPage(rows.length, rows.length + 499)
    if (error) throw new Error(error.message)
    if (!data?.length) return { data: rows }
    rows.push(...data)
  }
}
