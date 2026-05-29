/* =============================================
   Saiflow — Interactive Graph & Flowchart App
   Main Application Logic
   ============================================= */

(() => {
  'use strict';

  // ─── Utilities ────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const uid = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ─── Application State ────────────────────────
  const state = {
    nodes: new Map(),        // id → { id, x, y, w, h, shape, color, name, annotation }
    connections: new Map(),  // id → { id, from, to }
    theme: 'dark',
    canvas: { x: 0, y: 0, zoom: 1 },
    selectedNode: null,
    connectMode: false,
    disconnectMode: false,
    connectSource: null,
    dragging: null,          // { id, startX, startY, nodeStartX, nodeStartY }
    panning: null,           // { startX, startY, canvasStartX, canvasStartY }
    modalNodeId: null,
    modalEditing: false,
    contextNodeId: null,
  };

  // ─── DOM References ───────────────────────────
  const dom = {
    canvas: $('#canvas'),
    viewport: $('#canvasViewport'),
    svg: $('#connectionsSvg'),
    sidebar: $('#sidebar'),
    sidebarToggle: $('#sidebarToggle'),
    emptyState: $('#emptyState'),
    // Sidebar inputs
    nodeName: $('#nodeName'),
    nodeColor: $('#nodeColor'),
    nodeWidth: $('#nodeWidth'),
    nodeHeight: $('#nodeHeight'),
    nodeWidthVal: $('#nodeWidthVal'),
    nodeHeightVal: $('#nodeHeightVal'),
    shapeSelector: $('#shapeSelector'),
    addNodeBtn: $('#addNodeBtn'),
    connectModeBtn: $('#connectModeBtn'),
    disconnectModeBtn: $('#disconnectModeBtn'),
    connectHint: $('#connectHint'),
    clearAllBtn: $('#clearAllBtn'),
    // Topbar
    exportBtn: $('#exportBtn'),
    importBtn: $('#importBtn'),
    importFile: $('#importFile'),
    // Modal
    modalOverlay: $('#modalOverlay'),
    modalCard: $('#modalCard'),
    modalTitleText: $('#modalTitleText'),
    modalDot: $('#modalDot'),
    modalAnnotation: $('#modalAnnotation'),
    modalEditor: $('#modalEditor'),
    modalClose: $('#modalClose'),
    modalEdit: $('#modalEdit'),
    modalOk: $('#modalOk'),
    // Context menu
    contextMenu: $('#contextMenu'),
    ctxEditName: $('#ctxEditName'),
    ctxEditAnnotation: $('#ctxEditAnnotation'),
    ctxChangeColor: $('#ctxChangeColor'),
    ctxDelete: $('#ctxDelete'),
    // Zoom
    zoomIn: $('#zoomIn'),
    zoomOut: $('#zoomOut'),
    zoomReset: $('#zoomReset'),
    zoomLevel: $('#zoomLevel'),
    // Toast
    toastContainer: $('#toastContainer'),
  };

  // ─── Initialization ───────────────────────────
  function init() {
    loadState();
    renderAllNodes();
    renderConnections();
    updateEmptyState();
    updateZoomUI();
    applyCanvasTransform();
    bindEvents();
  }

  // ─── Event Binding ────────────────────────────
  function bindEvents() {
    // Sidebar toggle
    dom.sidebarToggle.addEventListener('click', toggleSidebar);

    // Theme buttons
    $$('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => setTheme(btn.dataset.theme));
    });

    // Shape selector
    dom.shapeSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.shape-btn');
      if (!btn) return;
      dom.shapeSelector.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    // Range inputs
    dom.nodeWidth.addEventListener('input', () => { dom.nodeWidthVal.textContent = dom.nodeWidth.value; });
    dom.nodeHeight.addEventListener('input', () => { dom.nodeHeightVal.textContent = dom.nodeHeight.value; });

    // Add node
    dom.addNodeBtn.addEventListener('click', addNodeFromSidebar);

    // Connect / Disconnect mode
    dom.connectModeBtn.addEventListener('click', toggleConnectMode);
    dom.disconnectModeBtn.addEventListener('click', toggleDisconnectMode);

    // Clear all
    dom.clearAllBtn.addEventListener('click', clearAll);

    // Export / Import
    dom.exportBtn.addEventListener('click', exportData);
    dom.importBtn.addEventListener('click', () => dom.importFile.click());
    dom.importFile.addEventListener('change', importData);

    // Canvas interactions
    dom.viewport.addEventListener('pointerdown', onCanvasPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.viewport.addEventListener('wheel', onWheel, { passive: false });
    dom.viewport.addEventListener('dblclick', onCanvasDblClick);

    // Zoom controls
    dom.zoomIn.addEventListener('click', () => zoomBy(0.15));
    dom.zoomOut.addEventListener('click', () => zoomBy(-0.15));
    dom.zoomReset.addEventListener('click', () => { state.canvas = { x: 0, y: 0, zoom: 1 }; applyCanvasTransform(); updateZoomUI(); saveState(); });

    // Modal
    dom.modalClose.addEventListener('click', closeModal);
    dom.modalOk.addEventListener('click', saveAndCloseModal);
    dom.modalEdit.addEventListener('click', toggleModalEdit);
    dom.modalOverlay.addEventListener('click', (e) => { if (e.target === dom.modalOverlay) saveAndCloseModal(); });

    // Context menu — close on outside click
    document.addEventListener('click', (e) => {
      if (!dom.contextMenu.contains(e.target)) hideContextMenu();
    });
    dom.ctxEditName.addEventListener('click', ctxRenameNode);
    dom.ctxEditAnnotation.addEventListener('click', ctxEditAnnotation);
    dom.ctxChangeColor.addEventListener('click', ctxChangeColor);
    dom.ctxDelete.addEventListener('click', ctxDeleteNode);

    // Keyboard
    document.addEventListener('keydown', onKeyDown);
  }

  // ─── Theme ────────────────────────────────────
  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    $$('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
    // Update SVG connection colors
    renderConnections();
    saveState();
  }

  // ─── Sidebar ──────────────────────────────────
  function toggleSidebar() {
    dom.sidebar.classList.toggle('collapsed');
    dom.sidebar.classList.toggle('open');
  }

  // ─── Node Management ─────────────────────────
  function getSelectedShape() {
    return dom.shapeSelector.querySelector('.shape-btn.active')?.dataset.shape || 'rectangle';
  }

  function addNodeFromSidebar() {
    const name = dom.nodeName.value.trim() || 'Nova Caixa';
    const shape = getSelectedShape();
    const color = dom.nodeColor.value;
    let w = parseInt(dom.nodeWidth.value);
    let h = parseInt(dom.nodeHeight.value);
    if (shape === 'circle') { h = w; }

    // Position: center of current viewport
    const vpRect = dom.viewport.getBoundingClientRect();
    const cx = (vpRect.width / 2 - state.canvas.x) / state.canvas.zoom;
    const cy = (vpRect.height / 2 - state.canvas.y) / state.canvas.zoom;

    // Slight random offset to avoid stacking
    const offsetX = (Math.random() - 0.5) * 60;
    const offsetY = (Math.random() - 0.5) * 60;

    const node = {
      id: uid(),
      x: cx - w / 2 + offsetX,
      y: cy - h / 2 + offsetY,
      w, h, shape, color,
      name,
      annotation: '',
    };

    state.nodes.set(node.id, node);
    renderNode(node);
    updateEmptyState();
    saveState();
    showToast(`Caixa "${name}" criada`, 'success');
    dom.nodeName.value = '';
  }

  function addNodeAtPosition(x, y) {
    const shape = getSelectedShape();
    const color = dom.nodeColor.value;
    let w = parseInt(dom.nodeWidth.value);
    let h = parseInt(dom.nodeHeight.value);
    if (shape === 'circle') h = w;

    const node = {
      id: uid(),
      x: x - w / 2,
      y: y - h / 2,
      w, h, shape, color,
      name: 'Nova Caixa',
      annotation: '',
    };
    state.nodes.set(node.id, node);
    renderNode(node);
    updateEmptyState();
    saveState();
  }

  function removeNode(id) {
    // Remove DOM element
    const el = dom.canvas.querySelector(`.node[data-id="${id}"]`);
    if (el) el.remove();
    // Remove all connections to/from this node
    for (const [cid, conn] of state.connections) {
      if (conn.from === id || conn.to === id) {
        state.connections.delete(cid);
      }
    }
    state.nodes.delete(id);
    if (state.selectedNode === id) state.selectedNode = null;
    renderConnections();
    updateEmptyState();
    saveState();
  }

  function renderNode(node) {
    // Remove existing if any
    const existing = dom.canvas.querySelector(`.node[data-id="${node.id}"]`);
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = 'node';
    el.dataset.id = node.id;
    el.dataset.shape = node.shape;
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';
    el.style.width = node.w + 'px';
    el.style.height = node.h + 'px';

    el.innerHTML = `
      <div class="node-inner" style="background-color: ${node.color};">
        <span class="node-label">${escapeHtml(node.name)}</span>
      </div>
      <div class="node-ports">
        <div class="port port-top"></div>
        <div class="port port-right"></div>
        <div class="port port-bottom"></div>
        <div class="port port-left"></div>
      </div>
    `;

    // Events on the node element
    el.addEventListener('pointerdown', (e) => onNodePointerDown(e, node.id));
    el.addEventListener('contextmenu', (e) => onNodeContextMenu(e, node.id));

    dom.canvas.appendChild(el);
  }

  function renderAllNodes() {
    // Clear existing nodes from DOM
    dom.canvas.querySelectorAll('.node').forEach(n => n.remove());
    for (const node of state.nodes.values()) {
      renderNode(node);
    }
  }

  function updateNodeDOM(node) {
    const el = dom.canvas.querySelector(`.node[data-id="${node.id}"]`);
    if (!el) return;
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';
    el.style.width = node.w + 'px';
    el.style.height = node.h + 'px';
    el.dataset.shape = node.shape;
    const inner = el.querySelector('.node-inner');
    if (inner) inner.style.backgroundColor = node.color;
    const label = el.querySelector('.node-label');
    if (label) label.textContent = node.name;
  }

  function updateEmptyState() {
    const show = state.nodes.size === 0;
    dom.emptyState.classList.toggle('hidden', !show);
  }

  // ─── Connections ──────────────────────────────
  function addConnection(fromId, toId) {
    if (fromId === toId) return;
    // Check if already connected
    for (const conn of state.connections.values()) {
      if ((conn.from === fromId && conn.to === toId) || (conn.from === toId && conn.to === fromId)) {
        showToast('Essas caixas já estão conectadas', 'warning');
        return;
      }
    }
    const conn = { id: uid(), from: fromId, to: toId };
    state.connections.set(conn.id, conn);
    renderConnections();
    saveState();
    showToast('Conexão criada', 'info');
  }

  function removeConnection(connId) {
    state.connections.delete(connId);
    renderConnections();
    saveState();
    showToast('Conexão removida', 'info');
  }

  function findConnection(fromId, toId) {
    for (const [cid, conn] of state.connections) {
      if ((conn.from === fromId && conn.to === toId) || (conn.from === toId && conn.to === fromId)) {
        return cid;
      }
    }
    return null;
  }

  function renderConnections() {
    // Remove all existing paths except defs
    dom.svg.querySelectorAll('.connection-group').forEach(g => g.remove());
    // Remove preview line
    dom.svg.querySelectorAll('.connection-preview').forEach(p => p.remove());

    const defs = dom.svg.querySelector('defs');
    if (defs) {
      defs.querySelectorAll('linearGradient').forEach(g => g.remove());
    }

    for (const conn of state.connections.values()) {
      const fromNode = state.nodes.get(conn.from);
      const toNode = state.nodes.get(conn.to);
      if (!fromNode || !toNode) continue;

      const pathInfo = calculatePath(fromNode, toNode);
      const pathD = pathInfo.path;

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.classList.add('connection-group');
      group.dataset.id = conn.id;

      // Invisible hit area
      const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitArea.setAttribute('d', pathD);
      hitArea.classList.add('connection-hit-area');
      hitArea.style.pointerEvents = 'stroke';

      // Visible path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathD);
      path.classList.add('connection-path');

      // Set connection color (dynamic gradient or solid color)
      if (fromNode.color === toNode.color) {
        path.style.stroke = fromNode.color;
      } else if (defs) {
        const gradId = `grad-${conn.id}`;
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.setAttribute('id', gradId);
        grad.setAttribute('x1', pathInfo.fromPort.x);
        grad.setAttribute('y1', pathInfo.fromPort.y);
        grad.setAttribute('x2', pathInfo.toPort.x);
        grad.setAttribute('y2', pathInfo.toPort.y);
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');

        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '30%');
        stop1.setAttribute('stop-color', fromNode.color);

        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '70%');
        stop2.setAttribute('stop-color', toNode.color);

        grad.appendChild(stop1);
        grad.appendChild(stop2);
        defs.appendChild(grad);

        path.style.stroke = `url(#${gradId})`;
      } else {
        path.style.stroke = fromNode.color;
      }

      if (state.disconnectMode) {
        path.classList.add('highlight-delete');
      }

      // Click to remove in disconnect mode
      const clickHandler = () => {
        if (state.disconnectMode) {
          removeConnection(conn.id);
        }
      };
      hitArea.addEventListener('click', clickHandler);
      path.addEventListener('click', clickHandler);

      group.appendChild(hitArea);
      group.appendChild(path);
      dom.svg.appendChild(group);
    }
  }

  // ─── Path Calculation ─────────────────────────
  function getNodeCenter(node) {
    return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
  }

  function getNodePorts(node) {
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;

    // Base ports (top, right, bottom, left midpoints of bounding box)
    const ports = [
      { x: cx, y: node.y, dx: 0, dy: -1, name: 'top' },
      { x: node.x + node.w, y: cy, dx: 1, dy: 0, name: 'right' },
      { x: cx, y: node.y + node.h, dx: 0, dy: 1, name: 'bottom' },
      { x: node.x, y: cy, dx: -1, dy: 0, name: 'left' },
    ];

    if (node.shape === 'diamond') {
      // Rotate ports by 45 degrees (Math.PI / 4 radians) around the center
      const angle = Math.PI / 4;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return ports.map(port => {
        const rx = port.x - cx;
        const ry = port.y - cy;
        return {
          x: cx + rx * cos - ry * sin,
          y: cy + rx * sin + ry * cos,
          dx: port.dx * cos - port.dy * sin,
          dy: port.dx * sin + port.dy * cos,
          name: port.name
        };
      });
    }

    return ports;
  }

  function calculatePath(fromNode, toNode) {
    const fromCenter = getNodeCenter(fromNode);
    const toCenter = getNodeCenter(toNode);
    const angle = Math.atan2(toCenter.y - fromCenter.y, toCenter.x - fromCenter.x);

    const fromPorts = getNodePorts(fromNode);
    const toPorts = getNodePorts(toNode);

    // Find best port pair — closest angle match
    const fromPort = pickBestPort(fromPorts, angle);
    const toPort = pickBestPort(toPorts, angle + Math.PI);

    const dist = Math.sqrt((toPort.x - fromPort.x) ** 2 + (toPort.y - fromPort.y) ** 2);
    const cpDist = Math.max(50, Math.min(dist * 0.4, 200));

    // Control points extend in port direction
    const cp1 = { x: fromPort.x + fromPort.dx * cpDist, y: fromPort.y + fromPort.dy * cpDist };
    const cp2 = { x: toPort.x + toPort.dx * cpDist, y: toPort.y + toPort.dy * cpDist };

    // Check for obstacles and adjust if needed
    const adjusted = adjustForObstacles(fromPort, cp1, cp2, toPort, fromNode, toNode);

    return {
      path: `M ${fromPort.x} ${fromPort.y} C ${adjusted.cp1.x} ${adjusted.cp1.y}, ${adjusted.cp2.x} ${adjusted.cp2.y}, ${toPort.x} ${toPort.y}`,
      fromPort,
      toPort
    };
  }

  function pickBestPort(ports, targetAngle) {
    let best = ports[0];
    let bestDiff = Infinity;
    for (const port of ports) {
      const portAngle = Math.atan2(port.dy, port.dx);
      let diff = Math.abs(normalizeAngle(portAngle - targetAngle));
      if (diff < bestDiff) {
        bestDiff = diff;
        best = port;
      }
    }
    return best;
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  function adjustForObstacles(fromPort, cp1, cp2, toPort, fromNode, toNode) {
    // Check if the midpoint of the bezier lies inside any other node
    const mid = bezierPoint(fromPort, cp1, cp2, toPort, 0.5);

    for (const node of state.nodes.values()) {
      if (node.id === fromNode.id || node.id === toNode.id) continue;
      if (pointInNodeRect(mid, node, 20)) {
        // Obstacle detected — push control points outward
        const nc = getNodeCenter(node);
        const pushDir = {
          x: mid.x - nc.x,
          y: mid.y - nc.y,
        };
        const pushLen = Math.sqrt(pushDir.x * pushDir.x + pushDir.y * pushDir.y) || 1;
        const pushDist = Math.max(node.w, node.h) * 0.8;
        const pushX = (pushDir.x / pushLen) * pushDist;
        const pushY = (pushDir.y / pushLen) * pushDist;

        return {
          cp1: { x: cp1.x + pushX, y: cp1.y + pushY },
          cp2: { x: cp2.x + pushX, y: cp2.y + pushY },
        };
      }
    }
    return { cp1, cp2 };
  }

  function bezierPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    };
  }

  function pointInNodeRect(pt, node, padding = 0) {
    return (
      pt.x >= node.x - padding &&
      pt.x <= node.x + node.w + padding &&
      pt.y >= node.y - padding &&
      pt.y <= node.y + node.h + padding
    );
  }

  // ─── Preview Line (while connecting) ──────────
  function showPreviewLine(fromPort, toX, toY) {
    removePreviewLine();
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dist = Math.sqrt((toX - fromPort.x) ** 2 + (toY - fromPort.y) ** 2);
    const cpDist = Math.max(30, dist * 0.3);
    const cp1 = { x: fromPort.x + fromPort.dx * cpDist, y: fromPort.y + fromPort.dy * cpDist };

    path.setAttribute('d', `M ${fromPort.x} ${fromPort.y} Q ${cp1.x} ${cp1.y}, ${toX} ${toY}`);
    path.classList.add('connection-preview');
    dom.svg.appendChild(path);
  }

  function removePreviewLine() {
    dom.svg.querySelectorAll('.connection-preview').forEach(p => p.remove());
  }

  // ─── Pointer Events ──────────────────────────
  function onNodePointerDown(e, nodeId) {
    e.stopPropagation();
    if (e.button === 2) return; // right click handled by context menu

    // Connect mode
    if (state.connectMode) {
      if (!state.connectSource) {
        state.connectSource = nodeId;
        highlightConnectSource(nodeId);
        dom.connectHint.textContent = 'Agora clique na caixa de destino';
        dom.connectHint.style.display = 'block';
      } else {
        addConnection(state.connectSource, nodeId);
        unhighlightConnectSource();
        state.connectSource = null;
        dom.connectHint.textContent = 'Clique em uma caixa de origem';
      }
      return;
    }

    // Disconnect mode — click two nodes to disconnect
    if (state.disconnectMode) {
      if (!state.connectSource) {
        state.connectSource = nodeId;
        highlightConnectSource(nodeId);
        dom.connectHint.textContent = 'Agora clique na caixa para desconectar';
        dom.connectHint.style.display = 'block';
      } else {
        const connId = findConnection(state.connectSource, nodeId);
        if (connId) {
          removeConnection(connId);
        } else {
          showToast('Essas caixas não estão conectadas', 'warning');
        }
        unhighlightConnectSource();
        state.connectSource = null;
        dom.connectHint.textContent = 'Clique em uma caixa para desconectar';
      }
      return;
    }

    // Start drag
    const node = state.nodes.get(nodeId);
    if (!node) return;

    selectNode(nodeId);
    state.dragging = {
      id: nodeId,
      startX: e.clientX,
      startY: e.clientY,
      nodeStartX: node.x,
      nodeStartY: node.y,
      hasMoved: false,
    };
    e.target.closest('.node')?.setPointerCapture?.(e.pointerId);
  }

  function onCanvasPointerDown(e) {
    // Don't handle if it's a node click
    if (e.target.closest('.node')) return;

    hideContextMenu();

    // Close sidebar on mobile if clicked outside
    if (window.innerWidth <= 768 && dom.sidebar.classList.contains('open')) {
      toggleSidebar();
    }

    // Cancel connect mode if active and clicking the canvas background
    if (state.connectMode) {
      toggleConnectMode();
      return;
    }

    // Cancel disconnect mode if active and clicking the canvas background
    if (state.disconnectMode) {
      toggleDisconnectMode();
      return;
    }

    // Deselect node
    if (state.selectedNode) {
      deselectNode();
    }

    // Start panning (left button or middle)
    if (e.button === 0 || e.button === 1) {
      state.panning = {
        startX: e.clientX,
        startY: e.clientY,
        canvasStartX: state.canvas.x,
        canvasStartY: state.canvas.y,
      };
      dom.viewport.classList.add('panning');
    }
  }

  function onPointerMove(e) {
    // Dragging node
    if (state.dragging) {
      const dx = (e.clientX - state.dragging.startX) / state.canvas.zoom;
      const dy = (e.clientY - state.dragging.startY) / state.canvas.zoom;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        state.dragging.hasMoved = true;
      }

      const node = state.nodes.get(state.dragging.id);
      if (!node) return;
      node.x = state.dragging.nodeStartX + dx;
      node.y = state.dragging.nodeStartY + dy;

      const el = dom.canvas.querySelector(`.node[data-id="${node.id}"]`);
      if (el) {
        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';
      }
      renderConnections();
      return;
    }

    // Panning canvas
    if (state.panning) {
      const dx = e.clientX - state.panning.startX;
      const dy = e.clientY - state.panning.startY;
      state.canvas.x = state.panning.canvasStartX + dx;
      state.canvas.y = state.panning.canvasStartY + dy;
      applyCanvasTransform();
      return;
    }

    // Preview line while connecting
    if (state.connectMode && state.connectSource) {
      const sourceNode = state.nodes.get(state.connectSource);
      if (sourceNode) {
        const canvasCoords = viewportToCanvas(e.clientX, e.clientY);
        const center = getNodeCenter(sourceNode);
        const angle = Math.atan2(canvasCoords.y - center.y, canvasCoords.x - center.x);
        const port = pickBestPort(getNodePorts(sourceNode), angle);
        showPreviewLine(port, canvasCoords.x, canvasCoords.y);
      }
    }
  }

  function onPointerUp(e) {
    if (state.dragging) {
      if (!state.dragging.hasMoved) {
        // It was a click, not a drag → open modal
        openModal(state.dragging.id);
      } else {
        saveState();
      }
      state.dragging = null;
      return;
    }
    if (state.panning) {
      state.panning = null;
      dom.viewport.classList.remove('panning');
      saveState();
    }
  }

  function onCanvasDblClick(e) {
    if (e.target.closest('.node')) return;
    const coords = viewportToCanvas(e.clientX, e.clientY);
    addNodeAtPosition(coords.x, coords.y);
    showToast('Caixa criada com duplo-clique', 'success');
  }

  // ─── Zoom ─────────────────────────────────────
  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    zoomAt(delta, e.clientX, e.clientY);
  }

  function zoomBy(delta) {
    const vpRect = dom.viewport.getBoundingClientRect();
    const cx = vpRect.width / 2 + vpRect.left;
    const cy = vpRect.height / 2 + vpRect.top;
    zoomAt(delta, cx, cy);
  }

  function zoomAt(delta, clientX, clientY) {
    const oldZoom = state.canvas.zoom;
    const newZoom = Math.max(0.15, Math.min(4, oldZoom + delta));

    // Zoom toward mouse position
    const vpRect = dom.viewport.getBoundingClientRect();
    const mouseX = clientX - vpRect.left;
    const mouseY = clientY - vpRect.top;

    state.canvas.x = mouseX - (mouseX - state.canvas.x) * (newZoom / oldZoom);
    state.canvas.y = mouseY - (mouseY - state.canvas.y) * (newZoom / oldZoom);
    state.canvas.zoom = newZoom;

    applyCanvasTransform();
    updateZoomUI();
    saveState();
  }

  function applyCanvasTransform() {
    dom.canvas.style.transform = `translate(${state.canvas.x}px, ${state.canvas.y}px) scale(${state.canvas.zoom})`;
  }

  function updateZoomUI() {
    dom.zoomLevel.textContent = Math.round(state.canvas.zoom * 100) + '%';
  }

  function viewportToCanvas(clientX, clientY) {
    const vpRect = dom.viewport.getBoundingClientRect();
    return {
      x: (clientX - vpRect.left - state.canvas.x) / state.canvas.zoom,
      y: (clientY - vpRect.top - state.canvas.y) / state.canvas.zoom,
    };
  }

  // ─── Selection ────────────────────────────────
  function selectNode(id) {
    deselectNode();
    state.selectedNode = id;
    const el = dom.canvas.querySelector(`.node[data-id="${id}"]`);
    if (el) el.classList.add('selected');
  }

  function deselectNode() {
    if (state.selectedNode) {
      const el = dom.canvas.querySelector(`.node[data-id="${state.selectedNode}"]`);
      if (el) el.classList.remove('selected');
      state.selectedNode = null;
    }
  }

  function highlightConnectSource(id) {
    const el = dom.canvas.querySelector(`.node[data-id="${id}"]`);
    if (el) el.classList.add('connect-source');
  }

  function unhighlightConnectSource() {
    dom.canvas.querySelectorAll('.node.connect-source').forEach(el => el.classList.remove('connect-source'));
  }

  // ─── Connect / Disconnect Modes ───────────────
  function toggleConnectMode() {
    if (state.disconnectMode) toggleDisconnectMode();

    state.connectMode = !state.connectMode;
    state.connectSource = null;
    unhighlightConnectSource();
    removePreviewLine();
    dom.connectModeBtn.classList.toggle('active', state.connectMode);
    dom.viewport.classList.toggle('connecting', state.connectMode);

    if (state.connectMode) {
      dom.connectHint.textContent = 'Clique em uma caixa de origem';
      dom.connectHint.style.display = 'block';
    } else {
      dom.connectHint.style.display = 'none';
    }
  }

  function toggleDisconnectMode() {
    if (state.connectMode) toggleConnectMode();

    state.disconnectMode = !state.disconnectMode;
    state.connectSource = null;
    unhighlightConnectSource();
    dom.disconnectModeBtn.classList.toggle('active', state.disconnectMode);

    if (state.disconnectMode) {
      dom.connectHint.textContent = 'Clique em uma conexão ou em duas caixas para desconectar';
      dom.connectHint.style.display = 'block';
    } else {
      dom.connectHint.style.display = 'none';
    }
    renderConnections(); // highlight connections in delete mode
  }

  // ─── Modal ────────────────────────────────────
  function openModal(nodeId) {
    const node = state.nodes.get(nodeId);
    if (!node) return;

    state.modalNodeId = nodeId;
    state.modalEditing = false;

    dom.modalTitleText.textContent = node.name;
    dom.modalDot.style.backgroundColor = node.color;

    if (node.annotation) {
      dom.modalAnnotation.textContent = node.annotation;
      dom.modalAnnotation.classList.remove('empty');
    } else {
      dom.modalAnnotation.textContent = 'Sem anotações. Clique em "Editar" para adicionar.';
      dom.modalAnnotation.classList.add('empty');
    }

    dom.modalAnnotation.style.display = 'block';
    dom.modalEditor.style.display = 'none';
    dom.modalEditor.value = node.annotation || '';
    dom.modalEdit.textContent = '✏️ Editar';

    // Show modal with animation
    dom.modalOverlay.style.display = 'flex';
    // Force reflow
    dom.modalOverlay.offsetHeight;
    dom.modalOverlay.classList.add('active');
  }

  function closeModal() {
    dom.modalOverlay.classList.remove('active');
    setTimeout(() => {
      dom.modalOverlay.style.display = '';
      state.modalNodeId = null;
      state.modalEditing = false;
    }, 400);
  }

  function saveAndCloseModal() {
    if (state.modalEditing && state.modalNodeId) {
      const node = state.nodes.get(state.modalNodeId);
      if (node) {
        node.annotation = dom.modalEditor.value;
        saveState();
      }
    }
    closeModal();
  }

  function toggleModalEdit() {
    state.modalEditing = !state.modalEditing;
    if (state.modalEditing) {
      dom.modalAnnotation.style.display = 'none';
      dom.modalEditor.style.display = 'block';
      dom.modalEditor.focus();
      dom.modalEdit.textContent = '👁️ Visualizar';
    } else {
      // Save changes
      const node = state.nodes.get(state.modalNodeId);
      if (node) {
        node.annotation = dom.modalEditor.value;
        if (node.annotation) {
          dom.modalAnnotation.textContent = node.annotation;
          dom.modalAnnotation.classList.remove('empty');
        } else {
          dom.modalAnnotation.textContent = 'Sem anotações. Clique em "Editar" para adicionar.';
          dom.modalAnnotation.classList.add('empty');
        }
        saveState();
      }
      dom.modalAnnotation.style.display = 'block';
      dom.modalEditor.style.display = 'none';
      dom.modalEdit.textContent = '✏️ Editar';
    }
  }

  // ─── Context Menu ─────────────────────────────
  function onNodeContextMenu(e, nodeId) {
    e.preventDefault();
    e.stopPropagation();
    state.contextNodeId = nodeId;
    selectNode(nodeId);
    dom.contextMenu.style.display = 'block';
    dom.contextMenu.style.left = e.clientX + 'px';
    dom.contextMenu.style.top = e.clientY + 'px';

    // Clamp to viewport
    requestAnimationFrame(() => {
      const rect = dom.contextMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        dom.contextMenu.style.left = (e.clientX - rect.width) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        dom.contextMenu.style.top = (e.clientY - rect.height) + 'px';
      }
    });
  }

  function hideContextMenu() {
    dom.contextMenu.style.display = 'none';
    state.contextNodeId = null;
  }

  function ctxRenameNode() {
    const nodeId = state.contextNodeId;
    hideContextMenu();
    const node = state.nodes.get(nodeId);
    if (!node) return;

    const el = dom.canvas.querySelector(`.node[data-id="${node.id}"]`);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const input = document.createElement('input');
    input.className = 'inline-edit-input';
    input.value = node.name;
    input.style.left = rect.left + 'px';
    input.style.top = rect.top + 'px';
    input.style.width = Math.max(rect.width, 180) + 'px';
    document.body.appendChild(input);
    input.focus();
    input.select();

    const finish = () => {
      const newName = input.value.trim();
      if (newName) {
        node.name = newName;
        updateNodeDOM(node);
        saveState();
      }
      input.remove();
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish();
      if (e.key === 'Escape') { input.value = node.name; finish(); }
    });
  }

  function ctxEditAnnotation() {
    const nodeId = state.contextNodeId;
    hideContextMenu();
    if (nodeId) {
      openModal(nodeId);
      // Auto-switch to edit mode
      setTimeout(() => toggleModalEdit(), 100);
    }
  }

  function ctxChangeColor() {
    const nodeId = state.contextNodeId;
    hideContextMenu();
    const node = state.nodes.get(nodeId);
    if (!node) return;

    // Create a hidden color input
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = node.color;
    colorInput.style.position = 'fixed';
    colorInput.style.opacity = '0';
    colorInput.style.pointerEvents = 'none';
    document.body.appendChild(colorInput);
    colorInput.click();
    colorInput.addEventListener('input', () => {
      node.color = colorInput.value;
      updateNodeDOM(node);
      renderConnections();
      saveState();
    });
    colorInput.addEventListener('change', () => {
      setTimeout(() => colorInput.remove(), 100);
    });
    colorInput.addEventListener('blur', () => {
      setTimeout(() => colorInput.remove(), 100);
    });
  }

  function ctxDeleteNode() {
    const nodeId = state.contextNodeId;
    hideContextMenu();
    const node = state.nodes.get(nodeId);
    if (!node) return;
    removeNode(node.id);
    showToast(`Caixa "${node.name}" excluída`, 'error');
  }

  // ─── Keyboard ─────────────────────────────────
  function onKeyDown(e) {
    // Escape — close modal, cancel modes
    if (e.key === 'Escape') {
      if (state.modalNodeId) { saveAndCloseModal(); return; }
      if (state.connectMode) { toggleConnectMode(); return; }
      if (state.disconnectMode) { toggleDisconnectMode(); return; }
      hideContextMenu();
      deselectNode();
    }

    // Delete / Backspace — remove selected node
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedNode) {
      // Don't delete if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const node = state.nodes.get(state.selectedNode);
      removeNode(state.selectedNode);
      if (node) showToast(`Caixa "${node.name}" excluída`, 'error');
    }
  }

  // ─── Clear All ────────────────────────────────
  function clearAll() {
    if (state.nodes.size === 0) {
      showToast('Nenhuma caixa para limpar', 'warning');
      return;
    }
    if (!confirm('Tem certeza que deseja limpar tudo? Esta ação não pode ser desfeita.')) return;
    state.nodes.clear();
    state.connections.clear();
    state.selectedNode = null;
    state.connectSource = null;
    renderAllNodes();
    renderConnections();
    updateEmptyState();
    saveState();
    showToast('Tudo foi limpo', 'info');
  }

  // ─── Persistence (localStorage) ───────────────
  const STORAGE_KEY = 'saiflow_data';

  function saveState() {
    try {
      const data = {
        version: '1.0',
        theme: state.theme,
        canvas: state.canvas,
        nodes: Array.from(state.nodes.values()),
        connections: Array.from(state.connections.values()),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('Saiflow: Failed to save state', err);
    }
  }

  function loadState() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Fallback to old storage key from MindFlow
        raw = localStorage.getItem('mindflow_data');
      }
      if (!raw) return;
      const data = JSON.parse(raw);

      if (data.theme) setTheme(data.theme);
      if (data.canvas) {
        state.canvas = { ...state.canvas, ...data.canvas };
      }
      if (data.nodes) {
        state.nodes.clear();
        for (const n of data.nodes) state.nodes.set(n.id, n);
      }
      if (data.connections) {
        state.connections.clear();
        for (const c of data.connections) state.connections.set(c.id, c);
      }
    } catch (err) {
      console.warn('Saiflow: Failed to load state', err);
    }
  }

  // ─── Export / Import ──────────────────────────
  function exportData() {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      theme: state.theme,
      canvas: state.canvas,
      nodes: Array.from(state.nodes.values()),
      connections: Array.from(state.connections.values()),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saiflow-${Date.now()}.saiflow`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Mapa exportado com sucesso!', 'success');
  }

  function importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.nodes || !data.connections) {
          throw new Error('Invalid format');
        }

        // Clear and load
        state.nodes.clear();
        state.connections.clear();
        for (const n of data.nodes) state.nodes.set(n.id, n);
        for (const c of data.connections) state.connections.set(c.id, c);

        if (data.theme) setTheme(data.theme);
        if (data.canvas) state.canvas = { ...state.canvas, ...data.canvas };

        renderAllNodes();
        renderConnections();
        applyCanvasTransform();
        updateZoomUI();
        updateEmptyState();
        saveState();
        showToast(`Mapa importado: ${state.nodes.size} caixas, ${state.connections.size} conexões`, 'success');
      } catch (err) {
        showToast('Erro ao importar: formato inválido', 'error');
        console.error('Import error:', err);
      }
    };
    reader.readAsText(file);
    // Reset file input
    dom.importFile.value = '';
  }

  // ─── Toast Notifications ──────────────────────
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${escapeHtml(message)}`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // ─── Helpers ──────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Start ────────────────────────────────────
  init();
})();
