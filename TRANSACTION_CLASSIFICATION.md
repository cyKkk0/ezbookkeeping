# 交易分类页面

本地地址：`/desktop#/transaction/classify`，桌面顶部标签图标进入。

页面默认显示分类名称包含“待分类 / 未分类 / Uncategorized / Unclassified”的交易，支持切换全部交易与待保存修改，按备注、账户、类型、当前分类、日期筛选。日期按每笔交易记录的时区显示。

单笔选择新分类，或勾选多笔相同类型的交易后批量应用。应用只修改页面草稿；点击“保存并同步”才写入现有数据库。刷新、关闭、离开页面前会提示尚未保存的修改。

## 保存机制

- 复用当前登录会话与 `useTransactionsStore.batchUpdateTransactionCategories`，不增加独立数据库或服务。
- 保存前重新读取交易，检查分类、类型、金额、账户或编辑权限变化；有冲突时显示提醒并要求重新核对。
- 收入、支出、转账只能选择对应的二级分类；余额调整不可分类。
- 按目标分类分组调用 `POST /api/v1/transactions/batch_update/category.json`。请求只包含 `transactionIds` 与 `categoryId`。
- 每组由现有服务端接口提交。同一次页面保存中的多个分类组并非一个数据库事务。
- 写入后重新读取交易，只有数据库返回目标分类的草稿才清除。部分失败的草稿保留重试；网络超时但实际提交的修改也可通过读取确认。
- 现有 store 会使交易明细、概览、统计分析缓存失效，下次进入相应页面时更新。

## 维护

- 页面：`src/views/desktop/transactions/ClassificationPage.vue`
- 数据校验及备注解析：`src/lib/transactionClassification.ts`
- 单元测试：`npx vitest run src/lib/transactionClassification.test.ts`
- 类型检查：`npx vue-tsc --noEmit`
- 构建：`npm ci`，`npm run build`
- 本地运行目录使用 `local-runtime/public`，将 `dist` 内容复制到该目录前备份旧资源。保留旧 hash 资源可让已打开的页面继续使用。

此页面为现有项目的中文本地功能扩展，无需额外 Python 环境。
