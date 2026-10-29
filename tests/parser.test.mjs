import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../www/js/parser.js';
import { DEFAULT_SHOPS } from '../www/js/defaults.js';

const shops = DEFAULT_SHOPS;
const check = (sentence, shopId, items) => {
  const r = parse(sentence, shops);
  assert.equal(r.shopId, shopId, `shop for "${sentence}"`);
  assert.deepEqual(r.items, items, `items for "${sentence}"`);
};

test('buy X from shop', () => check('buy books from Walmart', 'walmart', ['Books']));
test('i want to buy', () => check('I want to buy milk from Costco', 'costco', ['Milk']));
test('several items', () => check('i want to buy milk and eggs from costco', 'costco', ['Milk', 'Eggs']));
test('commas', () => check('bread, yogurt and bananas from Publix', 'publix', ['Bread', 'Yogurt', 'Bananas']));
test('save under', () => check('save phone charger under amazon', 'amazon', ['Phone charger']));
test('shop first', () => check('Costco paper towels', 'costco', ['Paper towels']));
test('add to shop list', () => check('add olive oil to my Kroger list', 'kroger', ['Olive oil']));
test('misheard shop', () => check('buy rice from wallmart', 'walmart', ['Rice']));
test('misheard shop 2', () => check('get apples from croger', 'kroger', ['Apples']));
test('split shop name', () => check('get batteries at wal mart', 'walmart', ['Batteries']));
test('one letter off', () => check('get socks from targt', 'target', ['Socks']));
test('no shop goes to unsorted', () => check('buy batteries', 'unsorted', ['Batteries']));
test('remind me', () => check('remind me to call the dentist', 'reminder', ['Call the dentist']));
test('remember keeps and', () => check('remember to pick up mom and dad', 'reminder', ['Pick up mom and dad']));
test('add under reminder', () => check('add renew car tag under reminder', 'reminder', ['Renew car tag']));
test('new shop command', () => {
  const r = parse('add shop Home Depot', shops);
  assert.equal(r.type, 'newShop');
  assert.equal(r.name, 'Home Depot');
});
test('empty', () => assert.equal(parse('   ', shops).type, 'empty'));
