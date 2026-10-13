const fs = require('node:fs');
const path = require('node:path');
const mapping = require('../docs/breadcrumbs/destinations.json');

function audit(input, config = mapping) {
  const issues = [];
  const assignments = [];
  const collectionEdits = [];
  const byKey = new Map(config.destinations.map(item => [item.key, item]));
  const snapshots = new Map((input.collections || []).map(item => [item.id, item]));
  const issue = (code, id, detail) => issues.push({ code, id, detail });
  const invalid = new Set();

  if (input.store !== config.store) {
    issue('wrong_store', input.store, `Expected ${config.store}`);
    return { issues, assignments, collectionEdits, ready: false };
  }
  if (new Set(config.destinations.map(item => item.id)).size !== config.destinations.length || byKey.size !== config.destinations.length) {
    issue('ambiguous', null, 'Destination IDs and keys must be unique');
    return { issues, assignments, collectionEdits, ready: false };
  }
  for (const item of config.destinations) {
    const seen = new Set();
    let next = item;
    while (next) {
      if (seen.has(next.id)) {
        issue('cyclic', item.id, 'Parent IDs form a cycle or repeat');
        invalid.add(item.key);
        break;
      }
      seen.add(next.id);
      if (!snapshots.get(next.id)?.onlineStorePublished) {
        issue('inaccessible', item.id, `Unavailable collection ${next.id}`);
        invalid.add(item.key);
      }
      if (next.parent && !byKey.has(next.parent)) {
        issue('missing_parent', item.id, `Unknown parent ${next.parent}`);
        invalid.add(item.key);
      }
      next = byKey.get(next.parent);
    }
    if (seen.size > 2) {
      issue('too_deep', item.id, 'First release supports at most two product links');
      invalid.add(item.key);
    }
  }

  for (const item of config.destinations) {
    if (invalid.has(item.key)) continue;
    const snapshot = snapshots.get(item.id);
    const parentId = byKey.get(item.parent)?.id || null;
    if ((snapshot.parentId || null) !== parentId || (snapshot.label || null) !== item.label) {
      collectionEdits.push({ id: item.id, before: { parentId: snapshot.parentId || null, label: snapshot.label || null }, after: { parentId, label: item.label } });
    }
  }

  for (const product of input.products || []) {
    const evidence = product.evidence;
    if (!evidence?.verified || !evidence.source || !evidence.categoryId) {
      issue('unmapped', product.id, 'Verified category and facts with an evidence source are required');
      continue;
    }
    if (!Array.isArray(evidence.families) || Object.values(evidence.facts || {}).some(value => !Array.isArray(value))) {
      issue('unmapped', product.id, 'Family and fact values must be arrays of reviewed values');
      continue;
    }
    const families = [...new Set(evidence.families || [])];
    if (families.length !== 1) {
      issue(families.length ? 'ambiguous' : 'unmapped', product.id, 'Exactly one verified garment family is required');
      continue;
    }
    const family = families[0];
    const root = config.destinations.find(item => item.family === family && !item.parent);
    if (!root) {
      issue('unmapped', product.id, `Unsupported family ${family}`);
      continue;
    }
    const exception = config.exceptions.find(item => item.styleCode === product.styleCode);
    if (exception && (family !== exception.family || !product.editorialReviewed)) {
      issue('ambiguous', product.id, exception.reason);
      continue;
    }
    const matches = config.rules.filter(rule => rule.family === family && (evidence.facts?.[rule.fact] || []).includes(rule.value));
    if (!exception && new Set(matches.map(rule => rule.destination)).size > 1) {
      issue('ambiguous', product.id, 'Conflicting garment subtype evidence');
      continue;
    }
    let destination = byKey.get(exception?.destination || matches[0]?.destination || root.key);
    if (invalid.has(destination.key)) {
      if (destination.key !== root.key && !invalid.has(root.key)) {
        issue('inaccessible', product.id, `Subtype ${destination.id}; use validated root`);
        destination = root;
      } else {
        issue('inaccessible', product.id, `Unavailable destination ${destination.id}`);
        continue;
      }
    }
    if (!Array.isArray(product.collectionIds) || product.membershipComplete !== true) {
      issue('unmapped', product.id, 'Complete collection membership export required');
      continue;
    }
    if (!product.collectionIds.includes(destination.id)) {
      issue('non_member', product.id, `Product is not in ${destination.id}`);
      if (destination.key !== root.key && !invalid.has(root.key) && product.collectionIds.includes(root.id)) {
        destination = root;
      } else continue;
    }
    const parent = byKey.get(destination.parent);
    if (parent && !product.collectionIds.includes(parent.id)) {
      issue('non_member', product.id, `Product is not in root ${parent.id}; omit parent link`);
    }
    assignments.push({ id: product.id, before: product.breadcrumbCollectionId || null, after: destination.id, source: evidence.source });
  }
  return { issues, assignments, collectionEdits, ready: issues.length === 0 };
}

if (require.main === module) {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath) throw new Error('Usage: node scripts/audit-at-breadcrumbs.cjs input.json [report.json]');
  const report = audit(JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8')));
  const json = JSON.stringify(report, null, 2) + '\n';
  if (outputPath) fs.writeFileSync(path.resolve(outputPath), json);
  else process.stdout.write(json);
  if (!report.ready) process.exitCode = 1;
}

module.exports = { audit };
