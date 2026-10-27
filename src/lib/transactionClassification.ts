import type { TransactionInfoResponse } from '@/models/transaction.ts';
import type { TransactionCategoryInfoResponse } from '@/models/transaction_category.ts';

export interface CategoryBatch {
    categoryId: string;
    transactionIds: string[];
}

export function categoryTypeForTransaction(type: number): number {
    return type === 2 ? 1 : type === 3 ? 2 : type === 4 ? 3 : 0;
}

export function isUnclassified(categoryName: string): boolean {
    return /待分类|未分类|uncategorized|unclassified/i.test(categoryName);
}

export function transactionDetails(comment: string): { merchant: string; summary: string; source: string } {
    const text = comment.replace(/^\[BILL:[^\]]+\]\s*/, '');
    const merchant = /对方[:：](.*?)(?=；摘要[:：]|$)/.exec(text)?.[1]?.trim() ?? '';
    const summary = /摘要[:：](.*?)(?=；支付[:：]|；订单[:：]|$)/.exec(text)?.[1]?.trim() ?? text;
    const source = comment.startsWith('[BILL:') ? text.split('；')[0] ?? '' : '';
    return { merchant, summary, source };
}

// Only category IDs are sent to the existing API. Amounts and accounts are never included.
export function buildCategoryBatches(
    rows: readonly TransactionInfoResponse[],
    drafts: Readonly<Record<string, string>>,
    categories: Readonly<Record<string, TransactionCategoryInfoResponse>>
): CategoryBatch[] {
    const byId = new Map(rows.map(row => [row.id, row]));
    const groups = new Map<string, string[]>();
    for (const [id, categoryId] of Object.entries(drafts)) {
        const row = byId.get(id);
        const category = categories[categoryId];
        if (!row || !row.editable || !category || category.hidden || category.subCategories?.length ||
            category.parentId === '0' || !category.parentId ||
            categoryTypeForTransaction(row.type) !== category.type) {
            throw new Error('存在不可编辑的交易或不匹配的分类，请刷新后重新选择。');
        }
        if (row.categoryId === categoryId) continue;
        const ids = groups.get(categoryId) ?? [];
        ids.push(id);
        groups.set(categoryId, ids);
    }
    return [...groups].map(([categoryId, transactionIds]) => ({ categoryId, transactionIds }));
}

export function conflictingTransactionIds(
    original: readonly TransactionInfoResponse[],
    latest: readonly TransactionInfoResponse[],
    drafts: Readonly<Record<string, string>>
): string[] {
    const before = new Map(original.map(row => [row.id, row]));
    const after = new Map(latest.map(row => [row.id, row]));
    return Object.keys(drafts).filter(id => {
        const a = before.get(id);
        const b = after.get(id);
        return !a || !b || !b.editable || a.categoryId !== b.categoryId ||
            a.type !== b.type || a.sourceAmount !== b.sourceAmount ||
            a.sourceAccountId !== b.sourceAccountId;
    });
}
