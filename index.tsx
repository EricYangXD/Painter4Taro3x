/* eslint-disable no-useless-escape */
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-undef */
/* eslint-disable no-console */
/* eslint-disable no-plusplus */
/* eslint-disable no-unused-expressions */
/* eslint-disable no-restricted-syntax */
/* eslint-disable complexity */
/* eslint-disable react/prefer-stateless-function */
/* eslint-disable @typescript-eslint/ban-types */
import { Component } from 'react';
import Taro from '@tarojs/taro';
import { Canvas } from '@tarojs/components';
import { getAuthSetting, saveImageToPhotosAlbum, equal } from './lib/util';
import Pen, { penCache, clearPenCache } from './lib/pen';
import Downloader from './lib/downloader';
import WxCanvas from './lib/wx-canvas';
import calc from './lib/calc';

const downloader = new Downloader();

interface IProps {
  use2D: boolean;
  customStyle: string; // canvas自定义样式
  customActionStyle: any;
  palette: object; // painter模板
  dancePalette: any; // painter模板
  scaleRatio: number;
  widthPixels: number; // 像素宽度
  dirty: boolean; // 启用脏检查，默认 false
  LRU: boolean;
  action: any;
  disableAction: boolean;
  clearActionBox: boolean;
  onImgErr: Function; // 图片失败回调
  onImgOK: Function; // 图片成功回调
  onViewUpdate: Function;
  onTouchEnd: Function;
  onDidShow: Function;
  onViewClicked: Function;
}

interface IState {
  painterStyle: string; // canvas 宽度+高度样式
}

export default class QyPoster extends Component<IProps, IState> {
  // eslint-disable-next-line react/static-property-placement
  static defaultProps = {
    use2D: false,
    customStyle: '',
    customActionStyle: {},
    palette: {},
    dancePalette: {},
    scaleRatio: 1,
    widthPixels: 0,
    dirty: false,
    LRU: false,
    action: {},
    disableAction: true,
    clearActionBox: true,
    onImgErr: () => null,
    onImgOK: () => null,
    onViewUpdate: () => null,
    onTouchEnd: () => null,
    onDidShow: () => null,
    onViewClicked: () => null,
  };
  canvasId = `k-canvas${Math.random()}`; // canvas-id
  $scope: any = null;
  // 最大尝试的绘制次数
  MAX_PAINT_COUNT = 5;
  ACTION_DEFAULT_SIZE = 24;
  ACTION_OFFSET = '2rpx';
  filePath: string;
  prevFindedIndex: number;

  constructor(props) {
    super(props);
    this.state = {
      painterStyle: '',
    };
  }

  canvasNode: any = null;
  currentPalette: any = {};
  movingCache: any = {};
  outterDisabled = false;
  isDisabled = false;
  needClear = false;
  canvasWidthInPx = 0; // width to px
  canvasHeightInPx = 0; // height to px
  paintCount = 0; // 绘制次数
  globalContext: any = null;
  /**
   * 判断一个 object 是否为空
   * @param {object} object
   */
  isEmpty(object) {
    // eslint-disable-next-line no-underscore-dangle,guard-for-in,no-restricted-syntax
    for (const _i in object) {
      return false;
    }
    return true;
  }

  isNeedRefresh(newVal, oldVal) {
    if (
      !newVal ||
      this.isEmpty(newVal) ||
      (this.props.dirty && equal(newVal, oldVal))
    ) {
      return false;
    }
    return true;
  }

  getBox(rect, type) {
    const boxArea: any = {
      type: 'rect',
      css: {
        height: `${rect.bottom - rect.top}px`,
        width: `${rect.right - rect.left}px`,
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        borderWidth: '4rpx',
        borderColor: '#1A7AF8',
        color: 'transparent',
      },
    };
    if (type === 'text') {
      boxArea.css = { ...boxArea.css, borderStyle: 'dashed' };
    }
    if (this.props.customActionStyle && this.props.customActionStyle.border) {
      boxArea.css = {
        ...boxArea.css,
        ...this.props.customActionStyle.border,
      };
    }
    Object.assign(boxArea, {
      id: 'box',
    });
    return boxArea;
  }

  getScaleIcon(rect, type) {
    let scaleArea: any = {};
    const { customActionStyle } = this.props;
    if (customActionStyle && customActionStyle.scale) {
      scaleArea = {
        type: 'image',
        url:
          type === 'text'
            ? customActionStyle.scale.textIcon
            : customActionStyle.scale.imageIcon,
        css: {
          height: `${2 * this.ACTION_DEFAULT_SIZE}rpx`,
          width: `${2 * this.ACTION_DEFAULT_SIZE}rpx`,
          borderRadius: `${this.ACTION_DEFAULT_SIZE}rpx`,
        },
      };
    } else {
      scaleArea = {
        type: 'rect',
        css: {
          height: `${2 * this.ACTION_DEFAULT_SIZE}rpx`,
          width: `${2 * this.ACTION_DEFAULT_SIZE}rpx`,
          borderRadius: `${this.ACTION_DEFAULT_SIZE}rpx`,
          color: '#0000ff',
        },
      };
    }
    scaleArea.css = {
      ...scaleArea.css,
      align: 'center',
      left: `${rect.right + this.ACTION_OFFSET.toPx()}px`,
      top:
        type === 'text'
          ? `${
              rect.top -
              this.ACTION_OFFSET.toPx() -
              scaleArea.css.height.toPx() / 2
            }px`
          : `${
              rect.bottom -
              this.ACTION_OFFSET.toPx() -
              scaleArea.css.height.toPx() / 2
            }px`,
    };
    Object.assign(scaleArea, {
      id: 'scale',
    });
    return scaleArea;
  }

  getDeleteIcon(rect) {
    let deleteArea: any = {};
    const { customActionStyle } = this.props;
    if (customActionStyle && customActionStyle.scale) {
      deleteArea = {
        type: 'image',
        url: customActionStyle.delete.icon,
        css: {
          height: `${2 * this.ACTION_DEFAULT_SIZE}rpx`,
          width: `${2 * this.ACTION_DEFAULT_SIZE}rpx`,
          borderRadius: `${this.ACTION_DEFAULT_SIZE}rpx`,
        },
      };
    } else {
      deleteArea = {
        type: 'rect',
        css: {
          height: `${2 * this.ACTION_DEFAULT_SIZE}rpx`,
          width: `${2 * this.ACTION_DEFAULT_SIZE}rpx`,
          borderRadius: `${this.ACTION_DEFAULT_SIZE}rpx`,
          color: '#0000ff',
        },
      };
    }
    deleteArea.css = {
      ...deleteArea.css,
      align: 'center',
      left: `${rect.left - this.ACTION_OFFSET.toPx()}px`,
      top: `${
        rect.top - this.ACTION_OFFSET.toPx() - deleteArea.css.height.toPx() / 2
      }px`,
    };
    Object.assign(deleteArea, {
      id: 'delete',
    });
    return deleteArea;
  }

  doAction(action?, callback?, isMoving?, overwrite?) {
    if (this.props.use2D) {
      return;
    }
    let newVal: any = null;
    if (action) {
      newVal = action.view;
    }
    if (newVal && newVal.id && this.touchedView.id !== newVal.id) {
      // 带 id 的动作给撤回时使用，不带 id，表示对当前选中对象进行操作
      const { views } = this.currentPalette;
      for (let i = 0; i < views.length; i++) {
        if (views[i].id === newVal.id) {
          // 跨层回撤，需要重新构建三层关系
          this.touchedView = views[i];
          this.findedIndex = i;
          this.sliceLayers();
          break;
        }
      }
    }

    const doView = this.touchedView;

    if (!doView || this.isEmpty(doView)) {
      return;
    }
    if (newVal && newVal.css) {
      if (overwrite) {
        doView.css = newVal.css;
      } else if (Array.isArray(doView.css) && Array.isArray(newVal.css)) {
        doView.css = Object.assign({}, ...doView.css, ...newVal.css);
      } else if (Array.isArray(doView.css)) {
        doView.css = Object.assign({}, ...doView.css, newVal.css);
      } else if (Array.isArray(newVal.css)) {
        doView.css = Object.assign({}, doView.css, ...newVal.css);
      } else {
        doView.css = { ...doView.css, ...newVal.css };
      }
    }
    if (newVal && newVal.rect) {
      doView.rect = newVal.rect;
    }
    if (newVal && newVal.url && doView.url && newVal.url !== doView.url) {
      downloader
        .download(newVal.url, this.props.LRU)
        .then((path) => {
          if (newVal.url.startsWith('https')) {
            doView.originUrl = newVal.url;
          }
          doView.url = path;
          Taro.getImageInfo({
            src: path,
            success: (res) => {
              doView.sHeight = res.height;
              doView.sWidth = res.width;
              this.reDraw(doView, callback, isMoving);
            },
            fail: () => {
              this.reDraw(doView, callback, isMoving);
            },
          });
        })
        .catch((error) => {
          // 未下载成功，直接绘制
          console.error(error);
          this.reDraw(doView, callback, isMoving);
        });
    } else {
      newVal &&
        newVal.text &&
        doView.text &&
        newVal.text !== doView.text &&
        (doView.text = newVal.text);
      newVal &&
        newVal.content &&
        doView.content &&
        newVal.content !== doView.content &&
        (doView.content = newVal.content);
      this.reDraw(doView, callback, isMoving);
    }
  }
  block: any = {};
  frontContext: any = null;
  reDraw(doView, callback, isMoving) {
    const draw = {
      width: this.currentPalette.width,
      height: this.currentPalette.height,
      views: this.isEmpty(doView) ? [] : [doView],
    };
    const pen = new Pen(this.globalContext, draw);

    if (isMoving && doView.type === 'text') {
      pen.paint(
        (callbackInfo) => {
          callback && callback(callbackInfo);
          this.props.onViewUpdate &&
            this.props.onViewUpdate({
              view: this.touchedView,
            });
        },
        true,
        this.movingCache
      );
    } else {
      // 某些机型（华为 P20）非移动和缩放场景下，只绘制一遍会偶然性图片绘制失败
      // if (!isMoving && !this.isScale) {
      //   pen.paint()
      // }
      pen.paint((callbackInfo) => {
        callback && callback(callbackInfo);
        this.props.onViewUpdate &&
          this.props.onViewUpdate({
            view: this.touchedView,
          });
      });
    }

    const { rect, css, type } = doView;

    this.block = {
      width: this.currentPalette.width,
      height: this.currentPalette.height,
      views: this.isEmpty(doView) ? [] : [this.getBox(rect, doView.type)],
    };
    if (css && css.scalable) {
      this.block.views.push(this.getScaleIcon(rect, type));
    }
    if (css && css.deletable) {
      this.block.views.push(this.getDeleteIcon(rect));
    }
    const topBlock = new Pen(this.frontContext, this.block);
    topBlock.paint();
  }

  isInView(x, y, rect) {
    return x > rect.left && y > rect.top && x < rect.right && y < rect.bottom;
  }

  isInDelete(x, y) {
    for (const view of this.block.views) {
      if (view.id === 'delete') {
        return (
          x > view.rect.left &&
          y > view.rect.top &&
          x < view.rect.right &&
          y < view.rect.bottom
        );
      }
    }
    return false;
  }

  isInScale(x, y) {
    for (const view of this.block.views) {
      if (view.id === 'scale') {
        return (
          x > view.rect.left &&
          y > view.rect.top &&
          x < view.rect.right &&
          y < view.rect.bottom
        );
      }
    }
    return false;
  }

  touchedView: any = {};
  findedIndex = -1;
  onClick() {
    const x = this.startX;
    const y = this.startY;
    const totalLayerCount = this.currentPalette.views.length;
    const canBeTouched: any = [];
    let isDelete = false;
    let deleteIndex = -1;
    for (let i = totalLayerCount - 1; i >= 0; i--) {
      const view = this.currentPalette.views[i];
      const { rect } = view;
      if (
        this.touchedView &&
        this.touchedView.id &&
        this.touchedView.id === view.id &&
        this.isInDelete(x, y, rect)
      ) {
        canBeTouched.length = 0;
        deleteIndex = i;
        isDelete = true;
        break;
      }
      if (this.isInView(x, y, rect)) {
        canBeTouched.push({
          view,
          index: i,
        });
      }
    }
    this.touchedView = {};
    if (canBeTouched.length === 0) {
      this.findedIndex = -1;
    } else {
      let i = 0;
      const touchAble = canBeTouched.filter((item) => Boolean(item.view.id));
      if (touchAble.length === 0) {
        this.findedIndex = canBeTouched[0].index;
      } else {
        for (i = 0; i < touchAble.length; i++) {
          if (this.findedIndex === touchAble[i].index) {
            i++;
            break;
          }
        }
        if (i === touchAble.length) {
          i = 0;
        }
        this.touchedView = touchAble[i].view;
        this.findedIndex = touchAble[i].index;
        this.props.onViewClicked &&
          this.props.onViewClicked({
            view: this.touchedView,
          });
      }
    }
    if (this.findedIndex < 0 || (this.touchedView && !this.touchedView.id)) {
      // 证明点击了背景 或无法移动的view
      this.frontContext.draw();
      if (isDelete) {
        this.props.onTouchEnd &&
          this.props.onTouchEnd({
            view: this.currentPalette.views[deleteIndex],
            index: deleteIndex,
            type: 'delete',
          });
        this.doAction();
      } else if (this.findedIndex < 0) {
        this.props.onViewClicked && this.props.onViewClicked({});
      }
      this.findedIndex = -1;
      this.prevFindedIndex = -1;
    } else if (this.touchedView && this.touchedView.id) {
      this.sliceLayers();
    }
  }

  sliceLayers() {
    const bottomLayers = this.currentPalette.views.slice(0, this.findedIndex);
    const topLayers = this.currentPalette.views.slice(this.findedIndex + 1);
    const bottomDraw = {
      width: this.currentPalette.width,
      height: this.currentPalette.height,
      background: this.currentPalette.background,
      views: bottomLayers,
    };
    const topDraw = {
      width: this.currentPalette.width,
      height: this.currentPalette.height,
      views: topLayers,
    };
    if (this.prevFindedIndex < this.findedIndex) {
      new Pen(this.bottomContext, bottomDraw).paint();
      this.doAction(null, (callbackInfo) => {
        this.movingCache = callbackInfo;
      });
      new Pen(this.topContext, topDraw).paint();
    } else {
      new Pen(this.topContext, topDraw).paint();
      this.doAction(null, (callbackInfo) => {
        this.movingCache = callbackInfo;
      });
      new Pen(this.bottomContext, bottomDraw).paint();
    }
    this.prevFindedIndex = this.findedIndex;
  }

  startX = 0;
  startY = 0;
  startH = 0;
  startW = 0;
  isScale = false;
  startTimeStamp = 0;

  onTouchStart(event) {
    if (this.isDisabled) {
      return;
    }
    const { x, y } = event.touches[0];
    this.startX = x;
    this.startY = y;
    this.startTimeStamp = new Date().getTime();
    if (this.touchedView && !this.isEmpty(this.touchedView)) {
      const { rect } = this.touchedView;
      if (this.isInScale(x, y, rect)) {
        this.isScale = true;
        this.movingCache = {};
        this.startH = rect.bottom - rect.top;
        this.startW = rect.right - rect.left;
      } else {
        this.isScale = false;
      }
    } else {
      this.isScale = false;
    }
  }

  onTouchEnd(e) {
    if (this.isDisabled) {
      return;
    }
    const current = new Date().getTime();
    if (current - this.startTimeStamp <= 500 && !this.hasMove) {
      !this.isScale && this.onClick(e);
    } else if (this.touchedView && !this.isEmpty(this.touchedView)) {
      this.props.onTouchEnd &&
        this.props.onTouchEnd({
          view: this.touchedView,
        });
    }
    this.hasMove = false;
  }

  onTouchCancel(e) {
    if (this.isDisabled) {
      return;
    }
    this.onTouchEnd(e);
  }

  hasMove = false;
  screenK = 1;
  onTouchMove(event) {
    if (this.isDisabled) {
      return;
    }
    this.hasMove = true;
    if (!this.touchedView || (this.touchedView && !this.touchedView.id)) {
      return;
    }
    const { x, y } = event.touches[0];
    const offsetX = x - this.startX;
    const offsetY = y - this.startY;
    const { rect, type } = this.touchedView;
    let css: any = {};
    if (this.isScale) {
      const newW = this.startW + offsetX > 1 ? this.startW + offsetX : 1;
      if (this.touchedView.css && this.touchedView.css.minWidth) {
        if (newW < this.touchedView.css.minWidth.toPx()) {
          return;
        }
      }
      if (this.touchedView.rect && this.touchedView.rect.minWidth) {
        if (newW < this.touchedView.rect.minWidth) {
          return;
        }
      }
      const newH = this.startH + offsetY > 1 ? this.startH + offsetY : 1;
      css = {
        width: `${newW}px`,
      };
      if (type !== 'text') {
        if (type === 'image') {
          css.height = `${(newW * this.startH) / this.startW}px`;
        } else {
          css.height = `${newH}px`;
        }
      }
    } else {
      this.startX = x;
      this.startY = y;
      css = {
        left: `${rect.x + offsetX}px`,
        top: `${rect.y + offsetY}px`,
        right: undefined,
        bottom: undefined,
      };
    }
    this.doAction(
      {
        view: {
          css,
        },
      },
      (callbackInfo) => {
        if (this.isScale) {
          this.movingCache = callbackInfo;
        }
      },
      !this.isScale
    );
  }

  initScreenK() {
    console.log('initScreenK');
    if (
      !(
        Taro.getApp() &&
        Taro.getApp().systemInfo &&
        Taro.getApp().systemInfo.screenWidth
      )
    ) {
      try {
        Taro.getApp().systemInfo = Taro.getSystemInfoSync();
      } catch (e) {
        const error = `Painter get system info failed, ${JSON.stringify(e)}`;
        console.error(error);
        this.props.onImgErr && this.props.onImgErr(error);
        return;
      }
    }
    this.screenK = 0.5;
    if (
      Taro.getApp() &&
      Taro.getApp().systemInfo &&
      Taro.getApp().systemInfo.screenWidth
    ) {
      this.screenK = Taro.getApp().systemInfo.screenWidth / 750;
    }
    this.setStringPrototype(this.screenK, this.props.scaleRatio);
  }

  bottomContext: any = null;
  topContext: any = null;

  initDancePalette() {
    console.log('initDancePalette');
    if (this.props.use2D) {
      return;
    }
    this.isDisabled = true;
    this.initScreenK();
    this.downloadImages(this.props.dancePalette).then(async (palette: any) => {
      this.currentPalette = palette;
      const { width, height } = palette;

      if (!width || !height) {
        console.error(
          `You should set width and height correctly for painter, width: ${width}, height: ${height}`
        );
        return;
      }
      this.setState({
        painterStyle: `width:${width.toPx()}px;height:${height.toPx()}px;`,
      });
      this.frontContext ||
        (this.frontContext = await this.getCanvasContext(
          this.props.use2D,
          'front'
        ));
      this.bottomContext ||
        (this.bottomContext = await this.getCanvasContext(
          this.props.use2D,
          'bottom'
        ));
      this.topContext ||
        (this.topContext = await this.getCanvasContext(
          this.props.use2D,
          'top'
        ));
      this.globalContext ||
        (this.globalContext = await this.getCanvasContext(
          this.props.use2D,
          'k-canvas'
        ));
      new Pen(this.bottomContext, palette, this.props.use2D).paint(() => {
        this.isDisabled = false;
        this.isDisabled = this.outterDisabled;
        this.props.onDidShow && this.props.onDidShow();
      });
      this.globalContext.draw();
      this.frontContext.draw();
      this.topContext.draw();
    });
    this.touchedView = {};
  }

  getCanvasContext(use2D, id) {
    console.log('getCanvasContext');
    const that = this;
    return new Promise((resolve) => {
      if (use2D) {
        const query = Taro.createSelectorQuery().in(that);
        const selectId = `#${id}`;
        query
          .select(selectId)
          .fields({ node: true, size: true })
          .exec((res) => {
            that.canvasNode = res[0].node;
            const ctx = that.canvasNode.getContext('2d');
            const wxCanvas = new WxCanvas('2d', ctx, id, true, that.canvasNode);
            resolve(wxCanvas);
          });
      } else {
        const temp = Taro.createCanvasContext(id, that);
        resolve(new WxCanvas('mina', temp, id, true));
      }
    });
  }

  setStringPrototype(screenK, scale) {
    console.log('setStringPrototype');
    /* eslint-disable no-extend-native */
    /**
     * string 到对应的 px
     * @param {Number} baseSize 当设置了 % 号时，设置的基准值
     */
    String.prototype.toPx = function toPx(_, baseSize) {
      if (this === '0') {
        return 0;
      }
      const REG = /-?[0-9]+(\.[0-9]+)?(rpx|px|%)/;

      const parsePx = (origin) => {
        const results = new RegExp(REG).exec(origin);
        if (!origin || !results) {
          console.error(`The size: ${origin} is illegal`);
          return 0;
        }
        const unit = results[2];
        const value = parseFloat(origin);

        let res = 0;
        if (unit === 'rpx') {
          res = Math.round(value * (screenK || 0.5) * (scale || 1));
        } else if (unit === 'px') {
          res = Math.round(value * (scale || 1));
        } else if (unit === '%') {
          res = Math.round((value * baseSize) / 100);
        }
        return res;
      };
      const formula = /^calc\((.+)\)$/.exec(this);
      if (formula && formula[1]) {
        // 进行 calc 计算
        const afterOne = formula[1].replace(
          /([^\s\(\+\-\*\/]+)\.(left|right|bottom|top|width|height)/g,
          (word) => {
            const [id, attr] = word.split('.');
            return penCache.viewRect[id][attr];
          }
        );
        const afterTwo = afterOne.replace(new RegExp(REG, 'g'), parsePx);
        return calc(afterTwo);
      }
      return parsePx(this);
    };
  }

  startPaint() {
    console.log('startPaint');
    if (this.isEmpty(this.props.palette)) {
      return;
    }

    this.paintCount = 0;
    clearPenCache();

    this.initScreenK();

    this.downloadImages(this.props.palette).then(async (palette: any) => {
      const { width, height } = palette;

      if (!width || !height) {
        console.error(
          `You should set width and height correctly for painter, width: ${width}, height: ${height}`
        );
        return;
      }

      let needScale = false;
      // 生成图片时，根据设置的像素值重新绘制
      if (width.toPx() !== this.canvasWidthInPx) {
        this.canvasWidthInPx = width.toPx();
        needScale = this.props.use2D;
      }
      if (this.props.widthPixels) {
        this.setStringPrototype(
          this.screenK,
          this.props.widthPixels / this.canvasWidthInPx
        );
        this.canvasWidthInPx = this.props.widthPixels;
      }

      if (this.canvasHeightInPx !== height.toPx()) {
        this.canvasHeightInPx = height.toPx();
        needScale = needScale || this.props.use2D;
      }

      this.setState({
        painterStyle: `width:${this.canvasWidthInPx}px;height:${this.canvasHeightInPx}px;`,
      });
      const ctx = Taro.createCanvasContext(this.canvasId, this.$scope);
      const pen = new Pen(ctx, palette);
      pen.paint(() => {
        this.saveImgToLocal();
      });
      this.setStringPrototype(this.screenK, this.props.scaleRatio);
    });
  }

  downloadImages(palette) {
    console.log('downloadImages');
    return new Promise((resolve, _reject) => {
      let preCount = 0;
      let completeCount = 0;
      const paletteCopy = JSON.parse(JSON.stringify(palette));
      if (paletteCopy.background) {
        preCount++;
        downloader.download(paletteCopy.background, this.props.LRU).then(
          (path) => {
            paletteCopy.background = path;
            completeCount++;
            if (preCount === completeCount) {
              resolve(paletteCopy);
            }
          },
          () => {
            completeCount++;
            if (preCount === completeCount) {
              resolve(paletteCopy);
            }
          }
        );
      }
      if (paletteCopy.views) {
        for (const view of paletteCopy.views) {
          if (view && view.type === 'image' && view.url !== '') {
            preCount++;
            /* eslint-disable no-loop-func */
            downloader.download(view.url, this.props.LRU).then(
              (path) => {
                view.originUrl = view.url;
                view.url = path;
                Taro.getImageInfo({
                  src: path,
                  success: (res) => {
                    // 获得一下图片信息，供后续裁减使用
                    view.sWidth = res.width;
                    view.sHeight = res.height;
                  },
                  fail: (error) => {
                    // 如果图片坏了，则直接置空，防止坑爹的 canvas 画崩溃了
                    console.warn(
                      `getImageInfo ${view.originUrl} failed, ${JSON.stringify(
                        error
                      )}`
                    );
                    view.url = '';
                  },
                  complete: () => {
                    completeCount++;
                    if (preCount === completeCount) {
                      resolve(paletteCopy);
                    }
                  },
                });
              },
              () => {
                completeCount++;
                if (preCount === completeCount) {
                  resolve(paletteCopy);
                }
              }
            );
          }
        }
      }
      if (preCount === 0) {
        resolve(paletteCopy);
      }
    });
  }

  saveImgToLocal() {
    console.log('saveImgToLocal');
    // 不懂为啥箭头函数用this还会报错...
    const that = this;
    setTimeout(() => {
      Taro.canvasToTempFilePath(
        {
          canvasId: this.canvasId,
          canvas: this.props.use2D ? this.canvasNode : null,
          destWidth: this.canvasWidthInPx,
          destHeight: this.canvasHeightInPx,
          success(res) {
            that.getImageInfo(res.tempFilePath);
          },
          fail(error) {
            console.error(
              `canvasToTempFilePath failed, ${JSON.stringify(error)}`
            );
            that.props.onImgErr && that.props.onImgErr(error);
          },
        },
        this.$scope
      );
    }, 300);
  }

  getImageInfo(filePath) {
    console.log('getImageInfo filePath', filePath);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    Taro.getImageInfo({
      src: filePath,
      success: (infoRes) => {
        if (this.paintCount > this.MAX_PAINT_COUNT) {
          const error = `The result is always fault, even we tried ${this.MAX_PAINT_COUNT} times`;
          console.error(error);
          this.props.onImgErr && this.props.onImgErr(error);
          return;
        }
        // 比例相符时才证明绘制成功，否则进行强制重绘制
        if (
          Math.abs(
            (infoRes.width * this.canvasHeightInPx -
              this.canvasWidthInPx * infoRes.height) /
              (infoRes.height * this.canvasHeightInPx)
          ) < 0.01
        ) {
          this.filePath = filePath;
          this.props.onImgOK && this.props.onImgOK({ path: filePath });
        } else {
          this.startPaint();
        }
        this.paintCount++;
      },
      fail: (error) => {
        console.error(`getImageInfo failed, ${JSON.stringify(error)}`);
        this.props.onImgErr && this.props.onImgErr(error);
      },
    });
  }

  // 保存海报到手机相册
  saveImage() {
    const scope = 'scope.writePhotosAlbum';
    getAuthSetting(scope).then((res: boolean) => {
      if (res) {
        // 授权过 直接保存
        this.saveImageToPhotos();
        return false;
      }
      // 未授权过 先获取权限
      getAuthSetting(scope).then((status: boolean) => {
        if (status) {
          // 获取保存图片到相册权限成功
          this.saveImageToPhotos();
          return false;
        }
        // 用户拒绝授权后的回调 获取权限失败
        Taro.showModal({
          title: '提示',
          content: '若不打开授权，则无法将图片保存在相册中！',
          showCancel: true,
          cancelText: '暂不授权',
          cancelColor: '#000000',
          confirmText: '去授权',
          confirmColor: '#3CC51F',
          success(e) {
            if (e.confirm) {
              // 用户点击去授权
              Taro.openSetting({
                // 调起客户端小程序设置界面，返回用户设置的操作结果。
              });
            } else {
              //
            }
          },
        });
        return true;
      });
      return true;
    });
  }

  saveImageToPhotos() {
    saveImageToPhotosAlbum(this.filePath)
      .then(() => {
        // 成功保存图片到本地相册
        // 保存失败
        Taro.showToast({
          title: '保存成功',
          icon: 'none',
        });
      })
      .catch(() => {
        // 保存失败
        Taro.showToast({
          title: '保存失败',
          icon: 'none',
        });
      });
  }

  UNSAFE_componentWillMount() {
    console.log('UNSAFE_componentWillMount', Taro.getStorageSync('savedFiles'));
    this.startPaint();
  }

  componentDidUpdate(prevProp) {
    console.log('componentDidUpdate', Taro.getStorageSync('savedFiles'));
    if (prevProp.palette !== this.props.palette) {
      this.paintCount = 0;
      this.startPaint();
    }
  }

  componentDidMount() {
    console.log('componentDidMount', this.props);
  }

  render() {
    return (
      <Canvas
        canvasId={this.canvasId}
        style={`${this.state.painterStyle}${this.props.customStyle}`}
      />
    );
  }
}
