import { describe, expect, it } from 'vitest';
import { CrawlBudgetsSchema, CrawlConfigSchema, type CrawlConfig } from '@ui-atlas/config';
import {
  canonicalizeUrl,
  CrawlPolicy,
  firstMatchingGlob,
  Frontier,
  frontierKey,
  globToRegExp,
  type CanonicalOptions,
} from '@ui-atlas/crawler';

const ORIGIN = 'https://site.test';

function crawlConfig(overrides: Record<string, unknown> = {}): CrawlConfig {
  return CrawlConfigSchema.parse(overrides);
}

function canonicalOptions(overrides: Record<string, unknown> = {}): CanonicalOptions {
  const config = crawlConfig(overrides);
  return { trailingSlash: config.trailingSlash, query: config.query };
}

/** Canonical URL, or the failure reason, so assertions read as one line. */
function canon(raw: string, base?: string, overrides: Record<string, unknown> = {}): string {
  const result = canonicalizeUrl(raw, canonicalOptions(overrides), base);
  return result.ok ? result.url : `!${result.reason}`;
}

function policy(overrides: Record<string, unknown> = {}, seeds = [`${ORIGIN}/`]): CrawlPolicy {
  return new CrawlPolicy(crawlConfig(overrides), seeds);
}

function frontier(
  options: { config?: Record<string, unknown>; budgets?: Record<string, unknown>; seeds?: string[] } = {},
): Frontier {
  const config = crawlConfig(options.config);
  return new Frontier({
    policy: new CrawlPolicy(config, options.seeds ?? [`${ORIGIN}/`]),
    budgets: CrawlBudgetsSchema.parse(options.budgets ?? {}),
  });
}

describe('URL canonicalisation', () => {
  it('drops the fragment, which is a position in a page and not a page', () => {
    expect(canon(`${ORIGIN}/docs#install`)).toBe(`${ORIGIN}/docs`);
    expect(canon(`${ORIGIN}/docs#`)).toBe(`${ORIGIN}/docs`);
  });

  it('normalises the trailing slash but never strips the root', () => {
    expect(canon(`${ORIGIN}/docs/`)).toBe(`${ORIGIN}/docs`);
    expect(canon(`${ORIGIN}/docs///`)).toBe(`${ORIGIN}/docs`);
    expect(canon(`${ORIGIN}/`)).toBe(`${ORIGIN}/`);
    expect(canon(ORIGIN)).toBe(`${ORIGIN}/`);
  });

  it('keeps the trailing slash when configured to', () => {
    expect(canon(`${ORIGIN}/docs/`, undefined, { trailingSlash: 'keep' })).toBe(`${ORIGIN}/docs/`);
  });

  it('lower-cases the host but not the path', () => {
    expect(canon('https://SITE.test/Docs/README')).toBe('https://site.test/Docs/README');
  });

  it('drops the default port and keeps a non-default one', () => {
    expect(canon('https://site.test:443/a')).toBe('https://site.test/a');
    expect(canon('http://site.test:80/a')).toBe('http://site.test/a');
    expect(canon('https://site.test:8443/a')).toBe('https://site.test:8443/a');
  });

  it('strips credentials, which are auth material and identify nothing', () => {
    expect(canon('https://user:secret@site.test/a')).toBe(`${ORIGIN}/a`);
  });

  it('collapses repeated slashes and resolves dot segments', () => {
    expect(canon(`${ORIGIN}//a///b`)).toBe(`${ORIGIN}/a/b`);
    expect(canon(`${ORIGIN}/a/b/../c`)).toBe(`${ORIGIN}/a/c`);
    expect(canon(`${ORIGIN}/a/./b`)).toBe(`${ORIGIN}/a/b`);
  });

  it('resolves a relative href against the page it was found on', () => {
    expect(canon('../sibling', `${ORIGIN}/docs/page`)).toBe(`${ORIGIN}/sibling`);
    expect(canon('/absolute', `${ORIGIN}/docs/page`)).toBe(`${ORIGIN}/absolute`);
    expect(canon('?only=query', `${ORIGIN}/docs/page`)).toBe(`${ORIGIN}/docs/page?only=query`);
  });

  it('drops tracking parameters but keeps parameters that choose a page', () => {
    expect(canon(`${ORIGIN}/list?utm_source=news&utm_campaign=x&page=2`)).toBe(
      `${ORIGIN}/list?page=2`,
    );
    expect(canon(`${ORIGIN}/list?FBCLID=abc&page=2`)).toBe(`${ORIGIN}/list?page=2`);
    expect(canon(`${ORIGIN}/list?gclid=abc`)).toBe(`${ORIGIN}/list`);
  });

  it('sorts surviving parameters so argument order is not a second page', () => {
    expect(canon(`${ORIGIN}/list?b=2&a=1`)).toBe(canon(`${ORIGIN}/list?a=1&b=2`));
    expect(canon(`${ORIGIN}/list?b=2&a=1`)).toBe(`${ORIGIN}/list?a=1&b=2`);
  });

  it('honours keep as an allowlist and dropAll as a blunt instrument', () => {
    expect(canon(`${ORIGIN}/l?a=1&b=2`, undefined, { query: { keep: ['a'] } })).toBe(
      `${ORIGIN}/l?a=1`,
    );
    expect(canon(`${ORIGIN}/l?a=1&b=2`, undefined, { query: { dropAll: true } })).toBe(
      `${ORIGIN}/l`,
    );
  });

  it('refuses schemes a browser must not be pointed at', () => {
    expect(canon('mailto:someone@site.test')).toBe('!unsupported-scheme');
    expect(canon('tel:+15550100')).toBe('!unsupported-scheme');
    expect(canon('javascript:alert(1)')).toBe('!unsupported-scheme');
    expect(canon('data:text/html,<h1>x')).toBe('!unsupported-scheme');
    expect(canon('ftp://site.test/file')).toBe('!unsupported-scheme');
  });

  it('reports an unparseable href rather than guessing', () => {
    expect(canon('   ')).toBe('!unparseable');
    expect(canon('not a url')).toBe('!unparseable');
  });

  it('is idempotent: canonicalising a canonical URL changes nothing', () => {
    for (const raw of [
      `${ORIGIN}/a/b/?utm_source=x&b=2&a=1#frag`,
      `${ORIGIN}/`,
      'https://site.test:8443//deep//path/',
    ]) {
      const once = canon(raw);
      expect(canon(once)).toBe(once);
    }
  });
});

describe('path globs', () => {
  it('matches everything under a root pattern, including the root', () => {
    const pattern = globToRegExp('/**');
    expect(pattern.test('/')).toBe(true);
    expect(pattern.test('/a')).toBe(true);
    expect(pattern.test('/a/b/c')).toBe(true);
  });

  it('treats a trailing /** as "this and everything under it"', () => {
    const pattern = globToRegExp('/checkout/**');
    expect(pattern.test('/checkout')).toBe(true);
    expect(pattern.test('/checkout/')).toBe(true);
    expect(pattern.test('/checkout/cart')).toBe(true);
    expect(pattern.test('/checkouts')).toBe(false);
    expect(pattern.test('/a/checkout')).toBe(false);
  });

  it('keeps * inside one segment and lets ** cross segments', () => {
    expect(globToRegExp('/docs/*').test('/docs/intro')).toBe(true);
    expect(globToRegExp('/docs/*').test('/docs/intro/deep')).toBe(false);
    expect(globToRegExp('/docs/**').test('/docs/intro/deep')).toBe(true);
    expect(globToRegExp('**/logout').test('/logout')).toBe(true);
    expect(globToRegExp('**/logout').test('/account/logout')).toBe(true);
    expect(globToRegExp('**/logout').test('/logout/confirm')).toBe(false);
  });

  it('matches ? against exactly one non-slash character', () => {
    expect(globToRegExp('/a?c').test('/abc')).toBe(true);
    expect(globToRegExp('/a?c').test('/ac')).toBe(false);
    expect(globToRegExp('/a?c').test('/a/c')).toBe(false);
  });

  it('escapes regex metacharacters so a literal dot stays literal', () => {
    expect(globToRegExp('/a.b').test('/a.b')).toBe(true);
    expect(globToRegExp('/a.b').test('/axb')).toBe(false);
    expect(globToRegExp('/a+b').test('/a+b')).toBe(true);
    expect(globToRegExp('/report(1)').test('/report(1)')).toBe(true);
  });

  it('reports which pattern matched, so a skip can name its rule', () => {
    expect(firstMatchingGlob('/checkout/cart', ['/admin/**', '/checkout/**'])).toBe('/checkout/**');
    expect(firstMatchingGlob('/docs', ['/admin/**'])).toBeUndefined();
  });
});

describe('crawl policy', () => {
  it('admits a same-origin page', () => {
    expect(policy().evaluate({ raw: `${ORIGIN}/docs` })).toEqual({
      admitted: true,
      url: `${ORIGIN}/docs`,
    });
  });

  it('turns away another origin', () => {
    const decision = policy().evaluate({ raw: 'https://elsewhere.test/docs' });
    expect(decision.admitted).toBe(false);
    expect(decision).toMatchObject({ reason: 'cross-origin', detail: 'https://elsewhere.test' });
  });

  it('admits an extra origin only when it is allow-listed', () => {
    const allowed = policy({ allowOrigins: ['https://docs.test'] });
    expect(allowed.evaluate({ raw: 'https://docs.test/a' }).admitted).toBe(true);
    expect(allowed.origins.has(ORIGIN)).toBe(true);
  });

  it('skips mailto, tel and other non-navigable schemes', () => {
    for (const raw of ['mailto:a@site.test', 'tel:+1', 'javascript:void(0)']) {
      expect(policy().evaluate({ raw })).toMatchObject({
        admitted: false,
        reason: 'unsupported-scheme',
      });
    }
  });

  it('skips downloads by extension', () => {
    expect(policy().evaluate({ raw: `${ORIGIN}/whitepaper.pdf` })).toMatchObject({
      admitted: false,
      reason: 'download',
      detail: '.pdf',
    });
    expect(policy().evaluate({ raw: `${ORIGIN}/archive.ZIP` })).toMatchObject({
      reason: 'download',
    });
    // A dotted path segment that is not an extension is still a page.
    expect(policy().evaluate({ raw: `${ORIGIN}/v1.2/guide` }).admitted).toBe(true);
  });

  it('never follows a sign-out link, and says so with its own reason', () => {
    for (const path of ['/logout', '/account/logout', '/sign-out', '/signout/confirm']) {
      expect(policy().evaluate({ raw: `${ORIGIN}${path}` })).toMatchObject({
        admitted: false,
        reason: 'denied-path',
      });
    }
  });

  it('reports an exclude and a deny separately even when both would fire', () => {
    const both = policy({ exclude: ['/logout'] });
    expect(both.evaluate({ raw: `${ORIGIN}/logout` })).toMatchObject({ reason: 'denied-path' });
    expect(both.evaluate({ raw: `${ORIGIN}/admin` })).toMatchObject({ admitted: true });
  });

  it('lets exclude beat include', () => {
    const scoped = policy({ include: ['/docs/**'], exclude: ['/docs/internal/**'] });
    expect(scoped.evaluate({ raw: `${ORIGIN}/docs/intro` }).admitted).toBe(true);
    expect(scoped.evaluate({ raw: `${ORIGIN}/docs/internal/x` })).toMatchObject({
      reason: 'excluded',
      detail: '/docs/internal/**',
    });
    expect(scoped.evaluate({ raw: `${ORIGIN}/blog` })).toMatchObject({ reason: 'not-included' });
  });

  it('honours rel=nofollow unless it is switched off', () => {
    expect(policy().evaluate({ raw: `${ORIGIN}/a`, rel: 'nofollow' })).toMatchObject({
      reason: 'nofollow',
    });
    expect(policy().evaluate({ raw: `${ORIGIN}/a`, rel: 'ugc NoFollow' })).toMatchObject({
      reason: 'nofollow',
    });
    expect(policy().evaluate({ raw: `${ORIGIN}/a`, rel: 'noopener' }).admitted).toBe(true);
    expect(
      policy({ respectNofollow: false }).evaluate({ raw: `${ORIGIN}/a`, rel: 'nofollow' }).admitted,
    ).toBe(true);
  });
});

describe('frontier', () => {
  it('derives a job key from the canonical URL alone', () => {
    const key = frontierKey(`${ORIGIN}/docs`);
    expect(frontierKey(`${ORIGIN}/docs`)).toBe(key);
    expect(frontierKey(`${ORIGIN}/other`)).not.toBe(key);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives URLs that canonicalise together the same key', () => {
    const one = frontier();
    const first = one.add({ raw: `${ORIGIN}/docs/?b=2&a=1#top` }, { depth: 0 });
    const second = frontier().add({ raw: `${ORIGIN}//docs?a=1&b=2` }, { depth: 0 });
    expect(first.admitted && second.admitted).toBe(true);
    if (first.admitted && second.admitted) expect(first.item.key).toBe(second.item.key);
  });

  it('deduplicates by canonical URL, queued or already visited', () => {
    const queue = frontier();
    expect(queue.add({ raw: `${ORIGIN}/a` }, { depth: 0 }).admitted).toBe(true);
    expect(queue.add({ raw: `${ORIGIN}/a/#x` }, { depth: 0 })).toMatchObject({
      admitted: false,
      reason: 'duplicate',
    });
    queue.next();
    expect(queue.add({ raw: `${ORIGIN}/a` }, { depth: 0 })).toMatchObject({ reason: 'duplicate' });
    expect(queue.skipCounts.duplicate).toBe(2);
  });

  it('enforces maxDepth on admission', () => {
    const queue = frontier({ budgets: { maxDepth: 1 } });
    expect(queue.add({ raw: `${ORIGIN}/a` }, { depth: 1 }).admitted).toBe(true);
    expect(queue.add({ raw: `${ORIGIN}/b` }, { depth: 2 })).toMatchObject({
      admitted: false,
      reason: 'depth-exceeded',
    });
  });

  it('enforces maxPages as a hard stop on handing out work', () => {
    const queue = frontier({ budgets: { maxPages: 2 } });
    for (const path of ['/a', '/b', '/c']) queue.add({ raw: `${ORIGIN}${path}` }, { depth: 0 });
    expect(queue.next()?.url).toBe(`${ORIGIN}/a`);
    expect(queue.next()?.url).toBe(`${ORIGIN}/b`);
    expect(queue.next()).toBeUndefined();
    expect(queue.pageBudgetSpent).toBe(true);
    expect(queue.pendingCount).toBe(1);
  });

  it('enforces maxQueued so a huge site cannot exhaust memory', () => {
    const queue = frontier({ budgets: { maxQueued: 2 } });
    expect(queue.add({ raw: `${ORIGIN}/a` }, { depth: 0 }).admitted).toBe(true);
    expect(queue.add({ raw: `${ORIGIN}/b` }, { depth: 0 }).admitted).toBe(true);
    expect(queue.add({ raw: `${ORIGIN}/c` }, { depth: 0 })).toMatchObject({
      admitted: false,
      reason: 'queue-full',
    });
    expect(queue.claimQueueFullWarning()).toBe(true);
    expect(queue.claimQueueFullWarning()).toBe(false);
  });

  it('marks a redirect destination seen without charging it a navigation', () => {
    const queue = frontier({ budgets: { maxPages: 2 } });
    queue.add({ raw: `${ORIGIN}/a` }, { depth: 0 });
    queue.add({ raw: `${ORIGIN}/b` }, { depth: 0 });
    queue.next();

    // `/a` redirected to `/b`, which was already queued.
    queue.markVisited(`${ORIGIN}/b`);
    expect(queue.pendingCount).toBe(0);
    expect(queue.next()).toBeUndefined();
    // One navigation, so the two-page budget still has room for a real page.
    expect(queue.visitedCount).toBe(1);
    expect(queue.pageBudgetSpent).toBe(false);

    expect(queue.add({ raw: `${ORIGIN}/b` }, { depth: 1 })).toMatchObject({
      reason: 'duplicate',
    });
    expect(queue.add({ raw: `${ORIGIN}/c` }, { depth: 1 }).admitted).toBe(true);
    expect(queue.next()?.url).toBe(`${ORIGIN}/c`);
  });

  it('hands out shallow pages before deep ones', () => {
    const queue = frontier();
    queue.add({ raw: `${ORIGIN}/root` }, { depth: 0 });
    queue.next();
    queue.add({ raw: `${ORIGIN}/child-a` }, { depth: 1 });
    queue.add({ raw: `${ORIGIN}/child-b` }, { depth: 1 });
    expect(queue.next()?.url).toBe(`${ORIGIN}/child-a`);
    queue.add({ raw: `${ORIGIN}/grandchild` }, { depth: 2 });
    expect(queue.next()?.url).toBe(`${ORIGIN}/child-b`);
    expect(queue.next()?.url).toBe(`${ORIGIN}/grandchild`);
  });

  it('counts every reason a link was turned away', () => {
    const queue = frontier({ config: { exclude: ['/private/**'] } });
    queue.add({ raw: 'mailto:a@site.test' }, { depth: 0 });
    queue.add({ raw: 'https://elsewhere.test/' }, { depth: 0 });
    queue.add({ raw: `${ORIGIN}/private/x` }, { depth: 0 });
    queue.add({ raw: `${ORIGIN}/logout` }, { depth: 0 });
    queue.add({ raw: `${ORIGIN}/a.pdf` }, { depth: 0 });
    expect(queue.skipCounts).toMatchObject({
      'unsupported-scheme': 1,
      'cross-origin': 1,
      excluded: 1,
      'denied-path': 1,
      download: 1,
    });
    expect(queue.pendingCount).toBe(0);
  });

  function resumeFrom(state: ReturnType<Frontier['toState']>): Frontier {
    return new Frontier({
      policy: new CrawlPolicy(crawlConfig(), [`${ORIGIN}/`]),
      budgets: CrawlBudgetsSchema.parse({}),
      resume: state,
    });
  }

  function snapshot(queue: Frontier) {
    return queue.toState({
      runId: 'run-1',
      seeds: [`${ORIGIN}/`],
      updatedAt: new Date(0).toISOString(),
    });
  }

  it('round-trips a committed page without re-handing it out', () => {
    const first = frontier();
    first.add({ raw: `${ORIGIN}/a` }, { depth: 0 });
    first.add({ raw: `${ORIGIN}/b` }, { depth: 0 });
    first.add({ raw: 'mailto:x@site.test' }, { depth: 0 });

    const taken = first.next();
    expect(taken?.url).toBe(`${ORIGIN}/a`);
    first.commit(`${ORIGIN}/a`);

    const state = snapshot(first);
    expect(state.visited).toEqual([`${ORIGIN}/a`]);
    expect(state.navigations).toBe(1);

    const resumed = resumeFrom(state);
    expect(resumed.visitedCount).toBe(1);
    expect(resumed.next()?.url).toBe(`${ORIGIN}/b`);
    expect(resumed.next()).toBeUndefined();
    // The already-recorded page is refused rather than crawled a second time.
    expect(resumed.add({ raw: `${ORIGIN}/a` }, { depth: 0 })).toMatchObject({
      reason: 'duplicate',
    });
    // Skip counts survive, so a resumed run's summary covers the whole crawl.
    expect(resumed.skipCounts['unsupported-scheme']).toBe(1);
  });

  it('puts a page that was in flight back in the queue, so a crash loses none', () => {
    const first = frontier();
    first.add({ raw: `${ORIGIN}/a` }, { depth: 0 });
    first.add({ raw: `${ORIGIN}/b` }, { depth: 0 });

    // Two workers each holding a page; neither has written its record yet.
    expect(first.next()?.url).toBe(`${ORIGIN}/a`);
    expect(first.next()?.url).toBe(`${ORIGIN}/b`);
    expect(first.inFlightCount).toBe(2);
    expect(first.isDrained).toBe(false);

    // The snapshot a crash would leave behind.
    const state = snapshot(first);
    expect(state.visited).toEqual([]);
    expect(state.navigations).toBe(0);
    expect(state.pending.map((item) => item.url).sort()).toEqual([
      `${ORIGIN}/a`,
      `${ORIGIN}/b`,
    ]);

    const resumed = resumeFrom(state);
    expect(resumed.next()?.url).toBe(`${ORIGIN}/a`);
    expect(resumed.next()?.url).toBe(`${ORIGIN}/b`);
  });

  it('counts in-flight pages against maxPages, so workers cannot overshoot', () => {
    const queue = frontier({ budgets: { maxPages: 2 } });
    for (const path of ['/a', '/b', '/c']) queue.add({ raw: `${ORIGIN}${path}` }, { depth: 0 });

    // Two workers take a page each. Neither has committed.
    expect(queue.next()).toBeDefined();
    expect(queue.next()).toBeDefined();
    expect(queue.pageBudgetSpent).toBe(true);
    // A third worker gets nothing, even though nothing is recorded yet.
    expect(queue.next()).toBeUndefined();
  });

  it('releases an abandoned page to the front of the queue', () => {
    const queue = frontier();
    queue.add({ raw: `${ORIGIN}/a` }, { depth: 0 });
    queue.add({ raw: `${ORIGIN}/b` }, { depth: 0 });

    const taken = queue.next();
    expect(taken?.url).toBe(`${ORIGIN}/a`);
    queue.release(`${ORIGIN}/a`);
    expect(queue.inFlightCount).toBe(0);
    // Back at the front: it was next before, and nothing about it has changed.
    expect(queue.next()?.url).toBe(`${ORIGIN}/a`);
    // Releasing something not in flight is a no-op, not a corruption.
    queue.release(`${ORIGIN}/nothing`);
    expect(queue.pendingCount).toBe(1);
  });

  it('is drained only when the queue is empty and nobody holds a page', () => {
    const queue = frontier();
    expect(queue.isDrained).toBe(true);
    queue.add({ raw: `${ORIGIN}/a` }, { depth: 0 });
    expect(queue.isDrained).toBe(false);
    const taken = queue.next();
    expect(queue.pendingCount).toBe(0);
    expect(queue.isDrained).toBe(false);
    queue.commit(taken?.url ?? '');
    expect(queue.isDrained).toBe(true);
  });
});
