<template>
    <main-page-layout :no-navbar="true">
        <template #content>
        <div class="classification-page">
            <header class="classification-header">
                <div>
                    <div class="text-overline text-primary">账单整理 · CLASSIFICATION</div>
                    <h1 class="text-h4 font-weight-bold mb-2">交易分类</h1>
                    <p class="text-body-medium text-medium-emphasis mb-0">集中整理支付宝、微信和银行流水，保存后同步到账本和统计分析。</p>
                </div>
                <div class="d-flex ga-3 align-center flex-wrap">
                    <v-btn variant="outlined" :disabled="busy" :prepend-icon="mdiRefresh" @click="refresh">刷新账单</v-btn>
                    <v-btn color="primary" :disabled="!dirtyCount || loading" :loading="saving" :prepend-icon="mdiCloudCheckOutline" @click="save">
                        保存并同步<span v-if="dirtyCount">（{{ dirtyCount }}）</span>
                    </v-btn>
                </div>
            </header>

            <div class="classification-stats">
                <v-card variant="flat" border><v-card-text><div class="text-medium-emphasis">账单总数</div><div class="stat-number">{{ rows.length.toLocaleString() }}<span>笔</span></div></v-card-text></v-card>
                <v-card variant="flat" border><v-card-text><div class="text-medium-emphasis">待分类</div><div class="stat-number text-warning">{{ pendingCount }}<span>笔</span></div></v-card-text></v-card>
                <v-card variant="flat" border><v-card-text><div class="text-medium-emphasis">待保存修改</div><div class="stat-number text-primary">{{ dirtyCount }}<span>笔</span></div></v-card-text></v-card>
            </div>

            <v-alert v-if="message" class="mb-4" :type="messageType" variant="tonal" closable @click:close="message = ''">{{ message }}</v-alert>
            <v-alert v-if="dirtyCount" class="mb-4" type="info" variant="tonal" density="compact">分类修改尚未保存。点击“保存并同步”后，数据库中的分类才会更新。</v-alert>

            <v-card variant="flat" border>
                <v-card-text>
                    <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-5">
                        <v-btn-toggle v-model="scope" mandatory color="primary" variant="tonal" divided density="comfortable" :disabled="busy">
                            <v-btn value="pending">待分类 {{ pendingCount }}</v-btn>
                            <v-btn value="all">全部交易</v-btn>
                            <v-btn value="draft">待保存 {{ dirtyCount }}</v-btn>
                        </v-btn-toggle>
                        <router-link to="/transaction/list" class="text-primary text-body-medium">查看交易明细 →</router-link>
                    </div>
                    <div class="classification-filters">
                        <v-text-field v-model="keyword" label="搜索收款方、摘要或备注" :prepend-inner-icon="mdiMagnify" variant="outlined" density="compact" hide-details clearable :disabled="busy" />
                        <v-select v-model="typeFilter" :items="typeItems" label="交易类型" variant="outlined" density="compact" hide-details :disabled="busy" />
                        <v-autocomplete v-model="accountFilter" :items="accountItems" label="账户 / 支付渠道" variant="outlined" density="compact" hide-details :disabled="busy" />
                        <v-autocomplete v-model="categoryFilter" :items="filterCategoryItems" label="当前分类" variant="outlined" density="compact" hide-details :disabled="busy" />
                        <v-text-field v-model="startDate" type="date" label="开始日期" variant="outlined" density="compact" hide-details :disabled="busy" />
                        <v-text-field v-model="endDate" type="date" label="结束日期" variant="outlined" density="compact" hide-details :disabled="busy" />
                    </div>
                    <div class="batch-bar mt-5">
                        <div class="text-body-medium">已选 <strong class="text-primary">{{ selected.length }}</strong> 笔<span class="text-medium-emphasis"> · 筛选结果 {{ filtered.length }} 笔</span></div>
                        <v-autocomplete v-model="batchCategory" :items="batchItems" label="为选中交易选择分类" variant="outlined" density="compact" hide-details class="batch-category" :disabled="busy || !selected.length || !batchItems.length" clearable />
                        <v-btn color="primary" variant="tonal" :disabled="busy || !selected.length || !batchCategory" @click="applyBatch">批量应用</v-btn>
                        <v-btn variant="text" :disabled="busy || !dirtyCount" @click="discard">撤销修改</v-btn>
                    </div>
                    <p v-if="selected.length && !batchItems.length" class="text-warning text-body-small mt-2 mb-0">批量分类需选择相同类型的交易，请分别处理收入、支出和转账。</p>
                </v-card-text>

                <v-progress-linear v-if="busy" indeterminate color="primary" aria-label="正在同步账单" />
                <v-table class="classification-table" hover>
                    <thead><tr>
                        <th class="selection-cell"><v-checkbox-btn :model-value="allPageSelected" :indeterminate="somePageSelected && !allPageSelected" :disabled="busy || !selectablePage.length" aria-label="选择本页交易" @update:model-value="selectPage" /></th>
                        <th>日期 / 渠道</th><th>收款方 / 交易摘要</th><th class="text-end">金额</th><th>账户</th><th>交易分类</th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="row in pageRows" :key="row.id" :class="{ 'draft-row': !!drafts[row.id] }">
                            <td class="selection-cell"><v-checkbox-btn :model-value="selected.includes(row.id)" :disabled="busy || !canEdit(row)" :aria-label="`选择交易 ${details(row).merchant || dateLabel(row)}`" @update:model-value="value => selectRow(row.id, !!value)" /></td>
                            <td class="date-cell"><div>{{ dateLabel(row) }}</div><div class="text-body-small text-medium-emphasis mt-1">{{ details(row).source || typeLabel(row.type) }}</div></td>
                            <td class="details-cell"><div class="font-weight-medium merchant">{{ details(row).merchant || details(row).summary || '无备注交易' }}</div><div v-if="details(row).merchant" class="text-body-small text-medium-emphasis summary mt-1">{{ details(row).summary || '—' }}</div><details v-if="row.comment" class="raw-comment text-body-small text-medium-emphasis mt-1"><summary>完整备注</summary><p>{{ row.comment }}</p></details></td>
                            <td class="text-end amount-cell"><div :class="row.type === 2 || row.sourceAmount < 0 ? 'text-success' : ''">{{ amountLabel(row) }}</div><div class="text-body-small text-medium-emphasis mt-1">{{ row.type === 3 && row.sourceAmount < 0 ? '支出退款' : typeLabel(row.type) }}</div></td>
                            <td class="account-cell">{{ accounts.allAccountsMap[row.sourceAccountId]?.name || '未知账户' }}</td>
                            <td class="category-cell">
                                <v-autocomplete :model-value="drafts[row.id] || row.categoryId" :items="categoryItems(row.type)" :aria-label="`交易分类 ${details(row).merchant || row.id}`" variant="outlined" density="compact" hide-details :disabled="busy || !canEdit(row)" @update:model-value="value => setDraft(row, value)" />
                                <div v-if="drafts[row.id]" class="text-body-small text-primary mt-1">待保存 · 原分类：{{ categoryName(row.categoryId) }}</div>
                                <div v-else-if="!canEdit(row)" class="text-body-small text-medium-emphasis mt-1">该交易不可修改分类</div>
                            </td>
                        </tr>
                        <tr v-if="!pageRows.length"><td colspan="6" class="text-center py-12"><v-icon :icon="mdiCheckCircleOutline" size="36" class="text-medium-emphasis mb-3" /><p class="text-body-large">{{ loading ? '正在加载账单…' : loadFailed ? '账单加载失败，请点击刷新重试' : scope === 'pending' ? '当前筛选下没有待分类交易' : '没有符合筛选条件的交易' }}</p><v-btn v-if="!loading && scope === 'pending'" variant="text" color="primary" @click="scope = 'all'">查看全部交易</v-btn></td></tr>
                    </tbody>
                </v-table>
                <div class="d-flex align-center justify-space-between flex-wrap ga-3 pa-4 border-t">
                    <span class="text-body-small text-medium-emphasis">每页 {{ pageSize }} 笔 · 共 {{ filtered.length }} 笔 · {{ lastSynced ? `最近同步 ${lastSynced}` : '保存后将核对数据库中的分类' }}</span>
                    <v-pagination v-model="page" :length="pageCount" :total-visible="5" density="comfortable" :disabled="busy" />
                </div>
            </v-card>
        </div>
        </template>
    </main-page-layout>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { mdiCheckCircleOutline, mdiCloudCheckOutline, mdiMagnify, mdiRefresh } from '@mdi/js';
import { useI18n } from '@/locales/helpers.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useTransactionCategoriesStore } from '@/stores/transactionCategory.ts';
import { useTransactionsStore } from '@/stores/transaction.ts';
import type { TransactionInfoResponse } from '@/models/transaction.ts';
import services from '@/lib/services.ts';
import { parseBigDecimal } from '@/lib/numeral.ts';
import { buildCategoryBatches, categoryTypeForTransaction, conflictingTransactionIds, isUnclassified, transactionDetails } from '@/lib/transactionClassification.ts';

const accounts = useAccountsStore();
const categories = useTransactionCategoriesStore();
const transactions = useTransactionsStore();
const { formatAmountToLocalizedNumeralsWithCurrency } = useI18n();
const rows = ref<TransactionInfoResponse[]>([]);
const drafts = ref<Record<string, string>>({});
const selected = ref<string[]>([]);
const loading = ref(false);
const saving = ref(false);
const loadFailed = ref(false);
const busy = computed(() => loading.value || saving.value);
const message = ref('');
const messageType = ref<'success' | 'error' | 'warning'>('success');
const scope = ref('pending');
const keyword = ref('');
const typeFilter = ref(0);
const accountFilter = ref('');
const categoryFilter = ref('');
const startDate = ref('');
const endDate = ref('');
const batchCategory = ref<string | null>(null);
const page = ref(1);
const pageSize = 30;
const lastSynced = ref('');
const dirtyCount = computed(() => Object.keys(drafts.value).length);
const categoryName = (id: string): string => categories.allTransactionCategoriesMap[id]?.name || '未分类';
const details = (row: TransactionInfoResponse) => transactionDetails(row.comment);
const pendingCount = computed(() => rows.value.filter(row => isUnclassified(categoryName(row.categoryId))).length);
const typeItems = [{ title: '全部类型', value: 0 }, { title: '支出', value: 3 }, { title: '收入', value: 2 }, { title: '转账', value: 4 }, { title: '余额调整', value: 1 }];
const typeLabel = (type: number): string => typeItems.find(item => item.value === type)?.title || '其他';
const accountItems = computed(() => [{ title: '全部账户', value: '' }, ...Object.values(accounts.allAccountsMap).filter(a => !a.subAccounts?.length).map(a => ({ title: a.name, value: a.id }))]);
const leaves = computed(() => Object.values(categories.allTransactionCategoriesMap).filter(c => c.parentId && c.parentId !== '0' && !c.subCategories?.length));
const categoryTitle = (id: string): string => {
    const c = categories.allTransactionCategoriesMap[id];
    const parent = c && categories.allTransactionCategoriesMap[c.parentId];
    return parent ? `${parent.name} / ${c?.name}` : categoryName(id);
};
const filterCategoryItems = computed(() => [{ title: '全部分类', value: '' }, ...leaves.value.map(c => ({ title: categoryTitle(c.id), value: c.id }))]);
const categoryItems = (type: number) => leaves.value.filter(c => c.visible && c.type === categoryTypeForTransaction(type)).map(c => ({ title: categoryTitle(c.id), value: c.id }));
const canEdit = (row: TransactionInfoResponse): boolean => row.editable && categoryTypeForTransaction(row.type) > 0;
// Display each record in its recorded timezone, including records near midnight.
const dateLabel = (row: TransactionInfoResponse): string => new Date((row.time + row.utcOffset * 60) * 1000).toISOString().slice(0, 16).replace('T', ' ');
const amountLabel = (row: TransactionInfoResponse): string => formatAmountToLocalizedNumeralsWithCurrency(row.hideAmount ? '***' : parseBigDecimal(row.sourceAmount), accounts.allAccountsMap[row.sourceAccountId]?.currency);
const filtered = computed(() => {
    const query = (keyword.value || '').trim().toLocaleLowerCase();
    return rows.value.filter(row => {
        if (scope.value === 'pending' && !isUnclassified(categoryName(row.categoryId))) return false;
        if (scope.value === 'draft' && !drafts.value[row.id]) return false;
        if (typeFilter.value && row.type !== typeFilter.value) return false;
        if (accountFilter.value && row.sourceAccountId !== accountFilter.value && row.destinationAccountId !== accountFilter.value) return false;
        if (categoryFilter.value && row.categoryId !== categoryFilter.value) return false;
        const date = dateLabel(row).slice(0, 10);
        if (startDate.value && date < startDate.value || endDate.value && date > endDate.value) return false;
        return !query || `${row.comment} ${accounts.allAccountsMap[row.sourceAccountId]?.name || ''} ${categoryName(row.categoryId)}`.toLocaleLowerCase().includes(query);
    });
});
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const pageRows = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const selectablePage = computed(() => pageRows.value.filter(canEdit));
const allPageSelected = computed(() => selectablePage.value.length > 0 && selectablePage.value.every(row => selected.value.includes(row.id)));
const somePageSelected = computed(() => selectablePage.value.some(row => selected.value.includes(row.id)));
const batchItems = computed(() => {
    const types = new Set(rows.value.filter(row => selected.value.includes(row.id)).map(row => row.type));
    return types.size === 1 ? categoryItems([...types][0] ?? 0) : [];
});
watch([scope, keyword, typeFilter, accountFilter, categoryFilter, startDate, endDate], () => { page.value = 1; selected.value = []; batchCategory.value = null; });
watch(pageCount, count => { page.value = Math.min(page.value, count); });
watch(selected, () => { batchCategory.value = null; });

function notify(text: string, type: 'success' | 'error' | 'warning'): void { message.value = text; messageType.value = type; }
function selectRow(id: string, value: boolean): void { selected.value = value ? [...new Set([...selected.value, id])] : selected.value.filter(item => item !== id); }
function selectPage(value: boolean | null): void {
    const ids = selectablePage.value.map(row => row.id);
    selected.value = value ? [...new Set([...selected.value, ...ids])] : selected.value.filter(id => !ids.includes(id));
}
function setDraft(row: TransactionInfoResponse, value: string | null): void {
    if (busy.value || !canEdit(row)) return;
    if (!value || value === row.categoryId) { delete drafts.value[row.id]; return; }
    if (!categoryItems(row.type).some(c => c.value === value)) return;
    drafts.value[row.id] = value;
}
function applyBatch(): void {
    if (!batchCategory.value || !batchItems.value.some(c => c.value === batchCategory.value)) return;
    for (const row of rows.value) if (selected.value.includes(row.id)) setDraft(row, batchCategory.value);
    selected.value = [];
}
function discard(): void {
    if (window.confirm('撤销所有尚未保存的分类修改？')) { drafts.value = {}; selected.value = []; }
}
async function fetchRows(): Promise<TransactionInfoResponse[]> {
    const response = await services.getAllTransactions({ startTime: 0, endTime: 0, withPictures: false });
    if (!response.data.success || !response.data.result) throw new Error('无法读取交易列表');
    return [...response.data.result].sort((a, b) => b.time - a.time || b.id.localeCompare(a.id));
}
async function load(): Promise<void> {
    loading.value = true;
    loadFailed.value = false;
    try {
        await Promise.all([accounts.loadAllAccounts({ force: false }), categories.loadAllCategories({})]);
        rows.value = await fetchRows();
        lastSynced.value = new Date().toLocaleTimeString();
    } catch { loadFailed.value = true; notify('加载失败，请检查本地服务是否运行，然后刷新重试。', 'error'); }
    finally { loading.value = false; }
}
async function refresh(): Promise<void> {
    if (dirtyCount.value && !window.confirm('刷新将撤销尚未保存的分类修改，继续刷新？')) return;
    drafts.value = {}; selected.value = []; message.value = '';
    await load();
}
async function save(): Promise<void> {
    if (busy.value || !dirtyCount.value) return;
    saving.value = true;
    const wanted = { ...drafts.value };
    try {
        const latest = await fetchRows();
        const conflicts = conflictingTransactionIds(rows.value, latest, wanted);
        if (conflicts.length) {
            rows.value = latest;
            notify(`${conflicts.length} 笔交易已在其他页面修改或不可编辑，已刷新当前分类。请核对待保存修改后再次保存。`, 'warning');
            return;
        }
        const groups = buildCategoryBatches(latest, wanted, categories.allTransactionCategoriesMap);
        const failures: string[] = [];
        for (const group of groups) {
            try { await transactions.batchUpdateTransactionCategories(group); }
            catch { failures.push(categoryName(group.categoryId)); }
        }
        // Verify persisted values even after an API error: a timed-out request may have committed.
        rows.value = await fetchRows();
        let confirmed = 0;
        for (const row of rows.value) {
            if (wanted[row.id] && row.categoryId === wanted[row.id]) { delete drafts.value[row.id]; confirmed++; }
        }
        selected.value = [];
        lastSynced.value = new Date().toLocaleTimeString();
        if (dirtyCount.value) notify(`已同步 ${confirmed} 笔，另有 ${dirtyCount.value} 笔未确认保存${failures.length ? `（${failures.join('、')}）` : ''}。修改已保留，可再次保存重试。`, 'warning');
        else notify(`已同步 ${confirmed} 笔分类，已重新读取数据库核对。统计分析将在下次打开时刷新。`, 'success');
    } catch (error) {
        notify(error instanceof Error && error.message.startsWith('存在不可编辑') ? error.message : '同步未完成或未能核对数据库。待保存修改已保留，请检查服务后重试。', 'error');
    } finally { saving.value = false; }
}
function beforeUnload(event: BeforeUnloadEvent): void {
    if (dirtyCount.value || saving.value) { event.preventDefault(); event.returnValue = ''; }
}
onBeforeRouteLeave(() => !saving.value && (!dirtyCount.value || window.confirm('还有未保存的分类修改，确定离开？')));
onMounted(() => { window.addEventListener('beforeunload', beforeUnload); void load(); });
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>

<style scoped>
.classification-page { max-width: 1600px; margin: 0 auto; padding: 30px 24px 48px; }
.classification-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.classification-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 24px; }
.stat-number { font-size: 32px; font-weight: 650; margin-top: 6px; font-variant-numeric: tabular-nums; }
.stat-number span { font-size: 13px; font-weight: 400; margin-left: 8px; color: rgb(var(--v-theme-on-surface)); opacity: .55; }
.classification-filters { display: grid; grid-template-columns: 2fr 1fr 1.4fr 1.5fr 1.1fr 1.1fr; gap: 12px; }
.batch-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 16px; background: rgba(var(--v-theme-primary), .04); border-radius: 8px; }
.batch-category { flex: 1; min-width: 260px; max-width: 430px; }
.classification-table :deep(th) { background: rgba(var(--v-theme-on-surface), .035); white-space: nowrap; }
.classification-table :deep(td) { padding-top: 16px !important; padding-bottom: 16px !important; vertical-align: top; }
.classification-table :deep(.draft-row) { background: rgba(var(--v-theme-primary), .045); }
.selection-cell { width: 48px; }
.date-cell { width: 150px; white-space: nowrap; font-size: 13px; }
.details-cell { min-width: 210px; max-width: 400px; }
.merchant, .summary { overflow-wrap: anywhere; }
.summary { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.raw-comment { max-width: 400px; overflow-wrap: anywhere; }
.raw-comment summary { cursor: pointer; }
.raw-comment p { margin: 8px 0 0; }
.amount-cell { min-width: 120px; white-space: nowrap; font-weight: 600; font-variant-numeric: tabular-nums; }
.account-cell { min-width: 110px; max-width: 180px; font-size: 13px; }
.category-cell { min-width: 290px; width: 320px; }
@media (max-width: 1200px) { .classification-filters { grid-template-columns: repeat(3, 1fr); } .classification-header { align-items: flex-start; flex-direction: column; } }
@media (max-width: 600px) { .classification-page { padding: 20px 12px; } .classification-stats { gap: 8px; } .classification-stats :deep(.v-card-text) { padding: 12px; } .stat-number { font-size: 25px; } .classification-filters { grid-template-columns: repeat(2, 1fr); } .batch-category { min-width: 100%; } }
</style>
