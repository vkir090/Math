import { SetNode, computeRegionMaskFromExpr } from './set-logic';

type VennOptions = {
  sets: 2 | 3;
  container: HTMLElement;
  interactive?: boolean;
  onMaskChange?: (mask: number) => void;
};

type RegionMeta = {
  bit: number;
  label: string;
  clip?: string[];
  mask?: string;
};

const REGION_META_2: RegionMeta[] = [
  { bit: 0, label: 'outside', mask: 'mask-out-2' },
  { bit: 1, label: 'B', clip: undefined, mask: 'mask-b-2' },
  { bit: 2, label: 'A', mask: 'mask-a-2' },
  { bit: 3, label: 'A∩B', clip: ['clipA', 'clipB'] },
];

const REGION_META_3: RegionMeta[] = [
  { bit: 0, label: 'outside', mask: 'mask-out-3' },
  { bit: 1, label: 'C', mask: 'mask-c-3' },
  { bit: 2, label: 'B', mask: 'mask-b-3' },
  { bit: 3, label: 'B∩C', clip: ['clipB', 'clipC'], mask: 'mask-bc-3' },
  { bit: 4, label: 'A', mask: 'mask-a-3' },
  { bit: 5, label: 'A∩C', clip: ['clipA', 'clipC'], mask: 'mask-ac-3' },
  { bit: 6, label: 'A∩B', clip: ['clipA', 'clipB'], mask: 'mask-ab-3' },
  { bit: 7, label: 'A∩B∩C', clip: ['clipA', 'clipB', 'clipC'] },
];

const circleDefs = {
  two: {
    A: { cx: 110, cy: 110, r: 90 },
    B: { cx: 190, cy: 110, r: 90 },
    viewBox: '0 0 300 220',
  },
  three: {
    A: { cx: 120, cy: 110, r: 85 },
    B: { cx: 190, cy: 110, r: 85 },
    C: { cx: 155, cy: 50, r: 85 },
    viewBox: '0 0 320 220',
  },
};

const regionMetaForSets = (count: 2 | 3) => (count === 2 ? REGION_META_2 : REGION_META_3);

export const computeMaskFromExpr = (exprAst: SetNode, sets: ('A' | 'B' | 'C')[]) =>
  computeRegionMaskFromExpr(exprAst, sets);

export const renderMaskToClasses = (mask: number, regions: RegionMeta[], expected?: number) =>
  regions.map((meta) => {
    const active = (mask & (1 << meta.bit)) !== 0;
    const expectedOn = expected !== undefined && (expected & (1 << meta.bit)) !== 0;
    const isMissing = expected !== undefined && expectedOn && !active;
    const isExtra = expected !== undefined && active && !expectedOn;
    const cls = ['region-fill'];
    if (active) cls.push('active');
    if (isMissing) cls.push('missing');
    if (isExtra) cls.push('extra');
    return { bit: meta.bit, className: cls.join(' ') };
  });

export const createVennDiagram = (opts: VennOptions) => {
  const regions = regionMetaForSets(opts.sets);
  let maskState = 0;
  let expectedMask: number | undefined;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', opts.sets === 2 ? circleDefs.two.viewBox : circleDefs.three.viewBox);
  svg.setAttribute('class', 'venn-svg');

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const cfg = opts.sets === 2 ? circleDefs.two : circleDefs.three;

  const addCircleDef = (id: string, { cx, cy, r }: { cx: number; cy: number; r: number }) => {
    const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clip.setAttribute('id', id);
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', String(r));
    clip.appendChild(c);
    defs.appendChild(clip);
    return c;
  };

  addCircleDef('clipA', cfg.A);
  addCircleDef('clipB', cfg.B);
  if (opts.sets === 3 && 'C' in cfg) addCircleDef('clipC', cfg.C as any);

  const addMask = (id: string, whiteShapes: (SVGElement | null)[], blackShapes: (SVGElement | null)[]) => {
    const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
    mask.setAttribute('id', id);
    const base = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    base.setAttribute('width', '100%');
    base.setAttribute('height', '100%');
    base.setAttribute('fill', 'black');
    mask.appendChild(base);
    whiteShapes.filter(Boolean).forEach((shape) => {
      const clone = shape!.cloneNode(true) as SVGElement;
      clone.setAttribute('fill', 'white');
      mask.appendChild(clone);
    });
    blackShapes.filter(Boolean).forEach((shape) => {
      const clone = shape!.cloneNode(true) as SVGElement;
      clone.setAttribute('fill', 'black');
      mask.appendChild(clone);
    });
    defs.appendChild(mask);
  };

  const circA = defs.querySelector('#clipA circle') as SVGCircleElement | null;
  const circB = defs.querySelector('#clipB circle') as SVGCircleElement | null;
  const circC = opts.sets === 3 ? (defs.querySelector('#clipC circle') as SVGCircleElement | null) : null;

  // Masks for 2-set regions
  addMask('mask-out-2', [svg.ownerDocument.createElementNS(svg.namespaceURI, 'rect')], [circA, circB]);
  addMask('mask-a-2', [circA], [circB]);
  addMask('mask-b-2', [circB], [circA]);

  if (opts.sets === 3) {
    addMask('mask-out-3', [svg.ownerDocument.createElementNS(svg.namespaceURI, 'rect')], [circA, circB, circC]);
    addMask('mask-a-3', [circA], [circB, circC]);
    addMask('mask-b-3', [circB], [circA, circC]);
    addMask('mask-c-3', [circC], [circA, circB]);
    addMask('mask-ab-3', [], [circC]);
    addMask('mask-ac-3', [], [circB]);
    addMask('mask-bc-3', [], [circA]);
  }

  svg.appendChild(defs);

  const background = document.createElementNS(svg.namespaceURI, 'rect');
  background.setAttribute('width', '100%');
  background.setAttribute('height', '100%');
  background.setAttribute('fill', 'var(--card-secondary, #0b1224)');
  svg.appendChild(background);

  const drawCircle = (circle: SVGCircleElement | null, label: string) => {
    if (!circle) return;
    const c = circle.cloneNode(true) as SVGCircleElement;
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', 'rgba(255,255,255,0.25)');
    c.setAttribute('stroke-width', '2');
    c.setAttribute('class', 'venn-outline');
    svg.appendChild(c);
    const text = document.createElementNS(svg.namespaceURI, 'text');
    text.setAttribute('x', String(Number(c.getAttribute('cx')) + 5));
    text.setAttribute('y', String(Number(c.getAttribute('cy')) - Number(c.getAttribute('r')) + 15));
    text.setAttribute('class', 'venn-label');
    text.textContent = label;
    svg.appendChild(text);
  };

  drawCircle(circA, 'A');
  drawCircle(circB, 'B');
  if (circC) drawCircle(circC, 'C');

  const regionGroup = document.createElementNS(svg.namespaceURI, 'g');
  regionGroup.setAttribute('class', 'venn-regions');
  svg.appendChild(regionGroup);

  const overlays: { bit: number; node: SVGRectElement }[] = [];

  const createRegion = (meta: RegionMeta) => {
    const rect = document.createElementNS(svg.namespaceURI, 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('class', 'region-fill');
    if (meta.clip) {
      const clipPath = meta.clip.reduce((acc, id) => acc + `url(#${id}) `, '').trim();
      rect.setAttribute('clip-path', clipPath.includes(' ') ? clipPath.split(' ').pop()! : clipPath);
      // sequential clips
      if (meta.clip.length > 1) {
        const wrapper = meta.clip.reduceRight((child: SVGElement, clipId: string) => {
          const g = document.createElementNS(svg.namespaceURI, 'g');
          g.setAttribute('clip-path', `url(#${clipId})`);
          g.appendChild(child);
          return g;
        }, rect as unknown as SVGElement);
        regionGroup.appendChild(wrapper);
        overlays.push({ bit: meta.bit, node: rect });
        return;
      }
    }
    if (meta.mask) {
      rect.setAttribute('mask', `url(#${meta.mask})`);
    }
    rect.dataset.bit = String(meta.bit);
    regionGroup.appendChild(rect);
    overlays.push({ bit: meta.bit, node: rect });
  };

  regionMetaForSets(opts.sets).forEach(createRegion);

  const setMask = (mask: number) => {
    maskState = mask;
    overlays.forEach(({ bit, node }) => {
      const active = (mask & (1 << bit)) !== 0;
      node.classList.toggle('active', active);
      if (!expectedMask) {
        node.classList.remove('missing', 'extra');
      }
    });
    applyHighlight();
  };

  const applyHighlight = () => {
    overlays.forEach(({ bit, node }) => {
      if (expectedMask === undefined) {
        node.classList.remove('missing', 'extra');
        return;
      }
      const expOn = (expectedMask & (1 << bit)) !== 0;
      const on = (maskState & (1 << bit)) !== 0;
      node.classList.toggle('missing', expOn && !on);
      node.classList.toggle('extra', on && !expOn);
    });
  };

  if (opts.interactive) {
    regionGroup.addEventListener('click', (ev) => {
      const target = ev.target as SVGRectElement;
      const bit = Number(target.dataset.bit);
      if (Number.isNaN(bit)) return;
      maskState ^= 1 << bit;
      setMask(maskState);
      opts.onMaskChange?.(maskState);
    });
  }

  opts.container.innerHTML = '';
  opts.container.appendChild(svg);

  return {
    element: svg,
    setMask,
    getMask: () => maskState,
    setExpectedMask: (mask?: number) => {
      expectedMask = mask;
      applyHighlight();
    },
    destroy: () => {
      svg.remove();
    },
  };
};
