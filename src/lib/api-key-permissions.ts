export const API_KEY_PERMISSIONS = [
  { value: 'POST_READ', label: '查询文章' },
  { value: 'POST_CREATE', label: '增加文章' },
  { value: 'POST_UPDATE', label: '修改文章' },
  { value: 'POST_DELETE', label: '删除文章' },
  { value: 'CATEGORY_READ', label: '查询分类' },
  { value: 'CATEGORY_CREATE', label: '增加分类' },
  { value: 'CATEGORY_UPDATE', label: '修改分类' },
  { value: 'CATEGORY_DELETE', label: '删除分类' },
  { value: 'TAG_READ', label: '查询标签' },
  { value: 'TAG_CREATE', label: '增加标签' },
  { value: 'TAG_UPDATE', label: '修改标签' },
  { value: 'TAG_DELETE', label: '删除标签' },
  { value: 'IMAGE_UPLOAD', label: '上传图片' },
] as const

export type ApiKeyPermission = typeof API_KEY_PERMISSIONS[number]['value']
export const API_KEY_PERMISSION_LIST = API_KEY_PERMISSIONS.map(item => item.value)
