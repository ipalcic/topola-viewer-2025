import {max, min} from 'd3-array';
import {interpolateNumber} from 'd3-interpolate';
import {select, Selection} from 'd3-selection';
import 'd3-transition';
import {
  D3ZoomEvent,
  zoom,
  ZoomBehavior,
  ZoomedElementBaseType,
  zoomTransform,
} from 'd3-zoom';
import {saveAs} from 'file-saver';
import {useEffect, useRef} from 'react';
import {IntlShape, useIntl} from 'react-intl';
import {
  ChartHandle,
  ChartInfo,
  CircleRenderer,
  createChart,
  DetailedRenderer,
  FancyChart,
  HourglassChart,
  IndiInfo,
  JsonGedcomData,
  RelativesChart,
  ChartColors as TopolaChartColors,
} from 'topola';
import {ChartColors, Ids, Sex} from './sidepanel/config/config';
import {Media} from './util/media';
import {usePrevious} from './util/previous-hook';

/** How much to zoom when using the +/- buttons. */
const ZOOM_FACTOR = 1.3;

/**
 * Called when the view is dragged with the mouse.
 *
 * @param size the size of the chart
 */
function zoomed(
  size: [number, number],
  event: D3ZoomEvent<ZoomedElementBaseType, unknown>,
) {
  const parent = select('#svgContainer').node() as Element;

  const scale = event.transform.k;
  const offsetX = max([0, (parent.clientWidth - size[0] * scale) / 2]);
  const offsetY = max([0, (parent.clientHeight - size[1] * scale) / 2]);
  select('#chartSvg')
    .attr('width', size[0] * scale)
    .attr('height', size[1] * scale)
    .attr('transform', `translate(${offsetX}, ${offsetY})`);
  select('#chart').attr('transform', `scale(${scale})`);

  parent.scrollLeft = -event.transform.x;
  parent.scrollTop = -event.transform.y;
}

/** Called when the scrollbars are used. */
function scrolled() {
  const parent = select('#svgContainer').node() as Element;
  const x = parent.scrollLeft + parent.clientWidth / 2;
  const y = parent.scrollTop + parent.clientHeight / 2;
  const scale = zoomTransform(parent).k;
  select(parent).call(zoom().translateTo, x / scale, y / scale);
}

/** Loads blob as data URL. */
function loadAsDataUrl(blob: Blob): Promise<string> {
  const reader = new FileReader();
  reader.readAsDataURL(blob);
  return new Promise<string>((resolve, reject) => {
    reader.onload = (e) => resolve((e.target as FileReader).result as string);
  });
}

async function inlineImage(image: SVGImageElement) {
  const href = image.href.baseVal;
  if (!href) {
    return;
  }
  try {
    const response = await fetch(href);
    const blob = await response.blob();
    const dataUrl = await loadAsDataUrl(blob);
    image.href.baseVal = dataUrl;
  } catch (e) {
    console.warn('Failed to load image:', e);
  }
}

/**
 * Fetches all images in the SVG and replaces them with inlined images as data
 * URLs. Images are replaced in place. The replacement is done, the returned
 * promise is resolved.
 */
async function inlineImages(svg: Element): Promise<void> {
  const images = Array.from(svg.getElementsByTagName('image'));
  await Promise.all(images.map(inlineImage));
}

/** Loads a blob into an image object. */
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = URL.createObjectURL(blob);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    image.addEventListener('load', () => resolve(image));
  });
}

/** Draw image on a new canvas and return the canvas. */
function drawImageOnCanvas(image: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  // Scale image for better quality.
  canvas.width = image.width * 2;
  canvas.height = image.height * 2;

  const ctx = canvas.getContext('2d')!;
  const oldFill = ctx.fillStyle;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = oldFill;

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject();
      }
    }, type);
  });
}

/** Return a copy of the SVG chart but without scaling and positioning. */
function getStrippedSvg() {
  const svg = document.getElementById('chartSvg')!.cloneNode(true) as Element;

  svg.removeAttribute('transform');
  const parent = select('#svgContainer').node() as Element;
  const scale = zoomTransform(parent).k;
  svg.setAttribute('width', String(Number(svg.getAttribute('width')) / scale));
  svg.setAttribute(
    'height',
    String(Number(svg.getAttribute('height')) / scale),
  );
  svg.querySelector('#chart')!.removeAttribute('transform');

  return svg;
}

function getSvgContents() {
  return new XMLSerializer().serializeToString(getStrippedSvg());
}

async function getSvgContentsWithInlinedImages() {
  const svg = getStrippedSvg();
  await inlineImages(svg);
  return new XMLSerializer().serializeToString(svg);
}

/** Shows the print dialog to print the chart. */
export async function printChart() {
  const contents = await getSvgContentsWithInlinedImages();
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  const pri = iframe.contentWindow;
  pri!.document.open();
  pri!.document.write(contents);
  pri!.document.close();
  pri!.focus();
  pri!.print();
  document.body.removeChild(iframe);
}

/** Downloads the chart as PDF. */
export async function downloadPdf() {
  const contents = await getSvgContentsWithInlinedImages();
  const blob = new Blob([contents], {type: 'image/svg+xml'});
  const image = await loadImage(blob);
  const canvas = drawImageOnCanvas(image);
  const pdfBlob = await canvasToBlob(canvas, 'application/pdf');
  saveAs(pdfBlob, 'chart.pdf');
}

/** Downloads the chart as PNG. */
export async function downloadPng() {
  const contents = await getSvgContentsWithInlinedImages();
  const blob = new Blob([contents], {type: 'image/svg+xml'});
  const image = await loadImage(blob);
  const canvas = drawImageOnCanvas(image);
  const pngBlob = await canvasToBlob(canvas, 'image/png');
  saveAs(pngBlob, 'chart.png');
}

/** Downloads the chart as SVG. */
export async function downloadSvg() {
  const contents = await getSvgContentsWithInlinedImages();
  const blob = new Blob([contents], {type: 'image/svg+xml'});
  saveAs(blob, 'chart.svg');
}

/** Chart type. */
export enum ChartType {
  Hourglass = 'hourglass',
  Relatives = 'relatives',
  Fancy = 'fancy',
  Donatso = 'donatso',
}

/** Props for the Chart component. */
interface ChartProps {
  data: JsonGedcomData;
  selection: IndiInfo;
  chartType: ChartType;
  onSelection: (info: IndiInfo) => void;
  freezeAnimation: boolean;
  colors: ChartColors;
  hideIds: Ids;
  hideSex: Sex;
}

/** Arguments for the renderChart function. */
interface RenderArgs {
  initialRender: boolean;
  resetPosition: boolean;
}

/** Maps chart type to topola chart type. */
function getChartType(chartType: ChartType): ChartHandle {
  switch (chartType) {
    case ChartType.Hourglass:
      return new HourglassChart();
    case ChartType.Relatives:
      return new RelativesChart();
    case ChartType.Fancy:
      return new FancyChart();
    default:
      return new HourglassChart();
  }
}

/** Maps chart type to topola renderer type. */
function getRendererType(chartType: ChartType): DetailedRenderer | CircleRenderer | CustomRenderer {
  switch (chartType) {
    case ChartType.Fancy:
      return new CircleRenderer();
    default:
      return new CustomRenderer(); // Koristi custom za default
  }
}

/** Maps colors config to topola colors. */
function chartColors() {
  const mapping = new Map<ChartColors, TopolaChartColors>([
    [ChartColors.Colored, TopolaChartColors.Colored],
    [ChartColors.Alternate, TopolaChartColors.Alternate],
    [ChartColors.LightGrey, TopolaChartColors.LightGrey],
    [ChartColors.White, TopolaChartColors.White],
  ]);
  return {
    get: (colors: ChartColors) => mapping.get(colors)!,
  };
}

/** Calculates zoom extent. */
function calculateScaleExtent(
  parent: Element,
  scale: number,
  chartInfo: ChartInfo,
): [number, number] {
  const minScale = min([
    parent.clientWidth / chartInfo.size[0],
    parent.clientHeight / chartInfo.size[1],
  ]);
  const maxScale = 2;
  return [minScale, maxScale];
}

/** Custom renderer za custom stilove linija. */
class CustomRenderer extends DetailedRenderer {
  renderLink(link: any) {
    const path = super.renderLink(link); // Pozovi originalni renderLink
    // Dodaj logiku za stilove: provjeri spol source/target da odrediš liniju
    // Muška linija (očevska): puna crna
    // Ženska linija (majčinska): isprekidana crvena
    // Pretpostavka: ako source je muški i target nije (djeca), muška; ako source ženski, ženska
    if (link.source.data.sex === 'M') {
      path.style('stroke', 'black').style('stroke-dasharray', 'none');
    } else if (link.source.data.sex === 'F') {
      path.style('stroke', 'red').style('stroke-dasharray', '3,3');
    }
    return path;
  }
}

/** Wrapper class to handle updates to the chart. */
class ChartWrapper {
  private chart?: ChartHandle;
  private zoomBehavior?: ZoomBehavior<Element, unknown>;
  private animating = false;
  private rerenderRequired = false;
  private rerenderProps?: ChartProps;
  private rerenderResetPosition?: boolean;

  zoom(factor: number) {
    const parent = select('#svgContainer').node() as Element;
    const x = parent.scrollLeft + parent.clientWidth / 2;
    const y = parent.scrollTop + parent.clientHeight / 2;
    select(parent)
      .transition()
      .call(this.zoomBehavior!.scaleBy, factor, [x, y]);
  }

  renderChart(props: ChartProps, intl: IntlShape, args: RenderArgs) {
    // Wait for animation to finish if animation is in progress.
    if (!args.initialRender && this.animating) {
      this.rerenderRequired = true;
      this.rerenderProps = props;
      this.rerenderResetPosition = args.resetPosition;
      return;
    }

    // Freeze changing selection after initial rendering.
    if (!args.initialRender && props.freezeAnimation) {
      return;
    }

    // Filtriraj data za unique osobe (koristi Map po ID-u)
    const uniqueIndis = new Map();
    props.data.indis.forEach((indi) => {
      if (!uniqueIndis.has(indi.id)) {
        uniqueIndis.set(indi.id, indi);
      }
    });
    const filteredData = { ...props.data, indis: Array.from(uniqueIndis.values()) };

    if (args.initialRender) {
      (select('#chart').node() as HTMLElement).innerHTML = '';
      this.chart = createChart({
        json: filteredData, // Koristi filtrirane data
        chartType: getChartType(props.chartType),
        renderer: getRendererType(props.chartType), // Koristi CustomRenderer za Detailed
        svgSelector: '#chart',
        indiCallback: (info) => props.onSelection(info),
        colors: chartColors().get(props.colors!),
        animate: true,
        updateSvgSize: false,
        locale: intl.locale,
      });
    } else {
      this.chart!.setData(filteredData);
    }
    const chartInfo = this.chart!.render({
      startIndi: props.selection.id,
      baseGeneration: props.selection.generation,
    });
    const svg = select('#chartSvg');
    const parent = select('#svgContainer').node() as Element;
    const scale = zoomTransform(parent).k;
    const extent: [number, number] = calculateScaleExtent(
      parent,
      scale,
      chartInfo,
    );

    this.zoomBehavior = zoom()
      .scaleExtent(extent)
      .translateExtent([[0, 0], chartInfo.size])
      .on('zoom', (event) => zoomed(chartInfo.size, event));

    select(parent).on('scroll', scrolled).call(this.zoomBehavior);

    const scrollTopTween = (scrollTop: number) => {
      return () => {
        const i = interpolateNumber(parent.scrollTop, scrollTop);
        return (t: number) => {
          parent.scrollTop = i(t);
        };
      };
    };
    const scrollLeftTween = (scrollLeft: number) => {
      return () => {
        const i = interpolateNumber(parent.scrollLeft, scrollLeft);
        return (t: number) => {
          parent.scrollLeft = i(t);
        };
      };
    };

    const dx = parent.clientWidth / 2 - chartInfo.origin[0] * scale;
    const dy = parent.clientHeight / 2 - chartInfo.origin[1] * scale;
    const offsetX = max([
      0,
      (parent.clientWidth - chartInfo.size[0] * scale) / 2,
    ]);
    const offsetY = max([
      0,
      (parent.clientHeight - chartInfo.size[1] * scale) / 2,
    ]);
    const svgTransition = svg.transition().delay(200).duration(500);
    const transition = args.initialRender ? svg : svgTransition;
    transition.attr('transform', `translate(${offsetX}, ${offsetY})`);
    transition.attr('width', chartInfo.size[0] * scale);
    transition.attr('height', chartInfo.size[1] * scale);
    if (args.resetPosition) {
      if (args.initialRender) {
        parent.scrollLeft = -dx;
        parent.scrollTop = -dy;
      } else {
        svgTransition
          .tween('scrollLeft', scrollLeftTween(-dx))
          .tween('scrollTop', scrollTopTween(-dy));
      }
    }

    // After the animation is finished, rerender the chart if required.
    this.animating = true;
    chartInfo.animationPromise.then(() => {
      this.animating = false;
      if (this.rerenderRequired) {
        this.rerenderRequired = false;
        // Use `this.rerenderProps` instead of the props in scope because
        // the props may have been updated in the meantime.
        this.renderChart(this.rerenderProps!, intl, {
          initialRender: false,
          resetPosition: !!this.rerenderResetPosition,
        });
      }
    });
  }
}

export function Chart(props: ChartProps) {
  const chartWrapper = new ChartWrapper(); // Koristi ref ako treba, ali za jednostavnost direktno
  const prevProps = usePrevious(props);
  const intl = useIntl();

  useEffect(() => {
    if (prevProps) {
      const initialRender =
        props.chartType !== prevProps?.chartType ||
        props.colors !== prevProps?.colors ||
        props.hideIds !== prevProps?.hideIds ||
        props.hideSex !== prevProps?.hideSex;
      const resetPosition =
        props.chartType !== prevProps?.chartType ||
        props.data !== prevProps.data ||
        props.selection !== prevProps.selection;
      chartWrapper.renderChart(props, intl, {
        initialRender,
        resetPosition,
      });
    } else {
      chartWrapper.renderChart(props, intl, {
        initialRender: true,
        resetPosition: true,
      });
    }
  }, [props]); // Dodaj dependency na props

  return (
    <div id="svgContainer">
      <Media greaterThanOrEqual="large" className="zoom">
        <button
          className="zoom-in"
          onClick={() => chartWrapper.zoom(ZOOM_FACTOR)}
        >
          +
        </button>
        <button
          className="zoom-out"
          onClick={() => chartWrapper.zoom(1 / ZOOM_FACTOR)}
        >
          −
        </button>
      </Media>
      <svg id="chartSvg">
        <g id="chart" />
      </svg>
    </div>
  );
}
