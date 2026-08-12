import { useEffect, useMemo, useState } from 'react';

import { SegmentedControl } from '../design/primitives';
import { foundationFixtures, type DesignFixture } from './fixtures';

type Theme = 'light' | 'dark';
type CanvasWidth = 'narrow' | 'standard' | 'wide';

const widthOptions = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'standard', label: 'Standard' },
  { value: 'wide', label: 'Wide' },
] as const;

function queryValue(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function DesignGraph() {
  const fixtures = foundationFixtures;
  const initialFixture = queryValue('fixture');
  const [fixtureId, setFixtureId] = useState(
    fixtures.some((fixture) => fixture.id === initialFixture) ? initialFixture! : fixtures[0]!.id,
  );
  const [theme, setTheme] = useState<Theme>(queryValue('theme') === 'dark' ? 'dark' : 'light');
  const [width, setWidth] = useState<CanvasWidth>(
    widthOptions.some((option) => option.value === queryValue('width'))
      ? (queryValue('width') as CanvasWidth)
      : 'standard',
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  const fixture = fixtures.find((candidate) => candidate.id === fixtureId) ?? fixtures[0]!;
  const groups = useMemo(
    () =>
      fixtures.reduce<Map<DesignFixture['group'], DesignFixture[]>>((map, candidate) => {
        const group = map.get(candidate.group) ?? [];
        group.push(candidate);
        map.set(candidate.group, group);
        return map;
      }, new Map()),
    [fixtures],
  );

  function selectFixture(nextId: string): void {
    const url = new URL(window.location.href);
    url.searchParams.set('fixture', nextId);
    url.searchParams.set('theme', theme);
    url.searchParams.set('width', width);
    window.history.replaceState(null, '', url);
    setFixtureId(nextId);
  }

  return (
    <div className="design-graph" data-localmd-design-graph data-theme={theme}>
      <aside className="design-graph-navigation" aria-label="Design fixtures">
        <header>
          <span>LocalMD</span>
          <strong>Desktop design graph</strong>
        </header>
        {[...groups].map(([group, entries]) => (
          <section key={group}>
            <h2>{group}</h2>
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-current={entry.id === fixture.id ? 'page' : undefined}
                onClick={() => selectFixture(entry.id)}
              >
                {entry.title}
              </button>
            ))}
          </section>
        ))}
      </aside>

      <section className="design-graph-workspace">
        <header className="design-graph-toolbar">
          <div>
            <h1>{fixture.title}</h1>
            <p>{fixture.description}</p>
          </div>
          <div className="design-graph-tools" data-lmd-shell="desktop">
            <SegmentedControl
              ariaLabel="Canvas width"
              value={width}
              options={widthOptions}
              onChange={setWidth}
            />
            <SegmentedControl
              ariaLabel="Appearance"
              value={theme}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={setTheme}
            />
          </div>
        </header>

        <div className="design-graph-stage">
          <div
            className="design-graph-canvas"
            data-canvas-width={width}
            data-lmd-shell="desktop"
            data-theme={theme}
            data-fixture={fixture.id}
          >
            {fixture.render()}
          </div>
        </div>
      </section>
    </div>
  );
}
