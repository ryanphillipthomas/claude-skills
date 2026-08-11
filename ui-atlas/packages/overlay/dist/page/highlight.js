export class Highlight {
    layer;
    hoverBox;
    selectedBox;
    marginBox;
    paddingBox;
    label;
    options;
    constructor(root, options) {
        this.options = options;
        this.layer = document.createElement('div');
        this.layer.className = 'ua-highlight-layer';
        this.marginBox = box('ua-box ua-box--margin');
        this.paddingBox = box('ua-box ua-box--padding');
        this.hoverBox = box('ua-box ua-box--hover');
        this.selectedBox = box('ua-box ua-box--selected');
        this.label = document.createElement('div');
        this.label.className = 'ua-box-label';
        this.label.hidden = true;
        this.layer.append(this.marginBox, this.paddingBox, this.hoverBox, this.selectedBox, this.label);
        root.append(this.layer);
        this.hideHover();
        this.hideSelected();
    }
    setOptions(options) {
        this.options = options;
        if (!options.showBoxModel) {
            this.marginBox.hidden = true;
            this.paddingBox.hidden = true;
        }
    }
    showHover(element, caption) {
        const rect = element.getBoundingClientRect();
        place(this.hoverBox, rect);
        this.hoverBox.hidden = false;
        this.label.textContent = caption;
        this.label.hidden = false;
        placeLabel(this.label, rect);
        if (this.options.showBoxModel)
            this.showBoxModel(element, rect);
    }
    hideHover() {
        this.hoverBox.hidden = true;
        this.label.hidden = true;
        this.marginBox.hidden = true;
        this.paddingBox.hidden = true;
    }
    showSelected(element) {
        place(this.selectedBox, element.getBoundingClientRect());
        this.selectedBox.hidden = false;
    }
    hideSelected() {
        this.selectedBox.hidden = true;
    }
    /** Re-measure a still-selected element after scroll, resize or layout change. */
    refreshSelected(element) {
        if (element === undefined || !element.isConnected) {
            this.hideSelected();
            return;
        }
        place(this.selectedBox, element.getBoundingClientRect());
    }
    showBoxModel(element, rect) {
        const view = element.ownerDocument.defaultView;
        if (view === null)
            return;
        const style = view.getComputedStyle(element);
        const num = (value) => Number.parseFloat(value) || 0;
        place(this.marginBox, {
            x: rect.x - num(style.marginLeft),
            y: rect.y - num(style.marginTop),
            width: rect.width + num(style.marginLeft) + num(style.marginRight),
            height: rect.height + num(style.marginTop) + num(style.marginBottom),
        });
        place(this.paddingBox, {
            x: rect.x + num(style.paddingLeft) + num(style.borderLeftWidth),
            y: rect.y + num(style.paddingTop) + num(style.borderTopWidth),
            width: Math.max(0, rect.width - num(style.paddingLeft) - num(style.paddingRight) - num(style.borderLeftWidth) - num(style.borderRightWidth)),
            height: Math.max(0, rect.height - num(style.paddingTop) - num(style.paddingBottom) - num(style.borderTopWidth) - num(style.borderBottomWidth)),
        });
        this.marginBox.hidden = false;
        this.paddingBox.hidden = false;
    }
    destroy() {
        this.layer.remove();
    }
}
function box(className) {
    const element = document.createElement('div');
    element.className = className;
    element.hidden = true;
    return element;
}
function place(element, rect) {
    element.style.transform = `translate(${String(Math.round(rect.x))}px, ${String(Math.round(rect.y))}px)`;
    element.style.width = `${String(Math.max(0, Math.round(rect.width)))}px`;
    element.style.height = `${String(Math.max(0, Math.round(rect.height)))}px`;
}
function placeLabel(element, rect) {
    const above = rect.y > 24;
    const y = above ? rect.y - 22 : rect.y + rect.height + 4;
    element.style.transform = `translate(${String(Math.round(rect.x))}px, ${String(Math.round(y))}px)`;
}
//# sourceMappingURL=highlight.js.map