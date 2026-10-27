import { describe, expect, it } from 'vitest';
import type { TransactionInfoResponse } from '@/models/transaction.ts';
import type { TransactionCategoryInfoResponse } from '@/models/transaction_category.ts';
import { buildCategoryBatches, conflictingTransactionIds, transactionDetails, isUnclassified } from './transactionClassification.ts';

const row = (id: string, type = 3): TransactionInfoResponse => ({
    id, timeSequenceId: id, type, categoryId: 'old', time: 1, utcOffset: 480,
    sourceAccountId: 'account', destinationAccountId: '0', sourceAmount: 100,
    destinationAmount: 0, hideAmount: false, tagIds: [], comment: '', editable: true
});
const category = (id: string, type = 2, parentId = 'parent'): TransactionCategoryInfoResponse => ({
    id, name: id, parentId, type, icon: '1', iconType: 0, color: '#000000',
    comment: '', displayOrder: 0, hidden: false
});
describe('transaction classification', () => {
    it('groups only IDs and categories, preserving all transaction data', () => {
        const rows = [row('a'), { ...row('b'), sourceAmount: -100 }, row('c', 2)];
        const original = JSON.stringify(rows);
        expect(buildCategoryBatches(rows, { a: 'food', b: 'food', c: 'salary' }, { food: category('food'), salary: category('salary', 1) })).toEqual([
            { categoryId: 'food', transactionIds: ['a', 'b'] }, { categoryId: 'salary', transactionIds: ['c'] }
        ]);
        expect(JSON.stringify(rows)).toBe(original);
    });
    it('rejects incompatible types, parent categories, hidden categories and locked rows before any write', () => {
        for (const [transaction, target] of [
            [row('a', 2), category('food')], [row('a'), category('food', 2, '0')],
            [row('a'), { ...category('food'), hidden: true }],
            [{ ...row('a'), editable: false }, category('food')], [row('a', 1), category('food')]
        ] as const) expect(() => buildCategoryBatches([transaction], { a: 'food' }, { food: target })).toThrow();
        expect(() => buildCategoryBatches([], { missing: 'food' }, { food: category('food') })).toThrow();
    });
    it('detects deletions and edits since loading instead of silently overwriting them', () => {
        const original = [row('a'), row('b'), row('c')];
        const latest = [{ ...row('a'), categoryId: 'other' }, { ...row('b'), sourceAmount: 200 }];
        expect(conflictingTransactionIds(original, latest, { a: 'food', b: 'food', c: 'food' })).toEqual(['a', 'b', 'c']);
        expect(conflictingTransactionIds(original, original, { a: 'food' })).toEqual([]);
    });
    it('extracts imported merchant details and preserves manual notes', () => {
        expect(transactionDetails('[BILL:123] 微信；账单.xlsx；对方:示例餐厅；摘要:晚餐；支付:银行卡；订单:123')).toEqual({ merchant: '示例餐厅', summary: '晚餐', source: '微信' });
        expect(transactionDetails('手动记账备注')).toEqual({ merchant: '', summary: '手动记账备注', source: '' });
        expect(isUnclassified('待分类支出')).toBe(true);
        expect(isUnclassified('餐饮美食')).toBe(false);
    });
});
