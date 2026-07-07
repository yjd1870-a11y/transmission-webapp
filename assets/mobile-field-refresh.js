(() => {
  const esc = (value) => escapeHtml(value || "");
  const text = (record, key) => valueText(record, key) || "";
  const circuitText = (record, key, fallbackKey) => text(record, key) || text(record, fallbackKey);

  photoBlock = function refreshedPhotoBlock(record, type, title) {
    const detailRows = type === "onu" ? `
      <div><dt>분할구분</dt><dd>${esc(text(record, "onuSplit")) || "&nbsp;"}</dd></div>
      <div><dt>셀구성</dt><dd>${esc(text(record, "onuCellConfig")) || "&nbsp;"}</dd></div>
    ` : "";
    return `<section class="field-photo-block kt-hfc-device" data-photo-type="${type}">
      <div class="kt-device-head"><strong>${title}</strong><button class="field-action" data-open-photos="${type}" type="button">현장사진</button></div>
      <dl class="kt-device-list">
        <div><dt>위치</dt><dd>${esc(text(record, `${type}Location`)) || "&nbsp;"}</dd></div>
        <div><dt>제조사</dt><dd>${esc(text(record, `${type}Maker`)) || "&nbsp;"}</dd></div>
        <div><dt>모델명</dt><dd>${esc(text(record, `${type}Model`)) || "&nbsp;"}</dd></div>
        ${detailRows}
      </dl>
    </section>`;
  };

  renderB2CRecord = function refreshedRenderB2CRecord(record) {
    const stationAddress = record.stationAddress || stationAddressForB2C(record.stationName);
    qs("#resultPanel").innerHTML = `
      <section class="field-record-sheet b2c-record-sheet kt-field-screen">
        <article class="kt-info-card">
          <h2>기본 정보</h2>
          <div class="kt-basic-grid">
            <span>B2C : <strong>${esc(record.serviceName || record.b2cName || record.searchValues?.find(Boolean) || "-")}</strong></span>
            <span>국사 : <strong>${esc(record.stationName || "-")}</strong></span>
          </div>
          <div class="kt-address">국사주소 : ${esc(stationAddress || "-")}</div>
        </article>
        <article class="kt-info-card kt-station-card">
          <h2>국사 현황</h2>
          <div class="kt-tabs"><span class="active">선번정보</span><span>송수신기 정보</span></div>
          <div class="field-table field-circuit-table cell-circuit-table b2c-circuit-table">
            <div class="field-table-head"><span>항목</span><span>노드</span><span>선번</span><span>평면도</span></div>
            <div><span>주(1)</span><span>${esc(record.node || "")}</span><span>${esc(record.line || "")}</span><button type="button" data-b2c-node-plan ${record.node ? "" : "disabled"}>이동</button></div>
            <div><span>주(2)</span><span></span><span></span><button type="button" disabled>이동</button></div>
            <div><span>예비</span><span></span><span></span><button type="button" disabled>이동</button></div>
          </div>
          <button class="field-line-diagram-btn kt-diagram-btn" type="button" data-b2c-line-diagram>직선도</button>
        </article>
        <article class="kt-info-card kt-remarks-card">
          <h2>비고</h2>
          <div class="kt-readonly-note"><strong>B2C : ${esc(record.serviceName || record.b2cName || "-")}</strong><span>비고: ${esc(record.memo || "-")}</span></div>
        </article>
      </section>`;

    qs("#resultPanel").querySelector("[data-b2c-line-diagram]")?.addEventListener("click", () => {
      renderHfcLineDiagram({
        stationName: record.stationName,
        stationAddress,
        cellName: record.cellName || record.serviceName || record.b2cName,
        b2cName: record.b2cName,
        serviceName: record.serviceName,
        memo: record.memo,
        otxMain: record.node,
        otxLine: record.line,
      }, "b2c");
    });
    qs("#resultPanel").querySelector("[data-b2c-node-plan]")?.addEventListener("click", () => {
      renderNodePlanOverview({ ...record, stationAddress }, record.node, "B2C");
    });
  };

  renderRecordEnhanced = function refreshedRenderRecordEnhanced(record) {
    qs("#resultPanel").innerHTML = `
      <section class="field-record-sheet cell-record-sheet kt-field-screen">
        <article class="kt-info-card">
          <h2>기본 정보</h2>
          <div class="kt-basic-grid"><span>셀 명 : <strong>${esc(record.cellName)}</strong></span><span>국사 : <strong>${esc(record.stationName)}</strong></span></div>
          <div class="kt-address">국사주소 : ${esc(record.stationAddress || "-")}</div>
        </article>
        <article class="kt-info-card kt-station-card">
          <h2>국사 현황</h2>
          <div class="kt-tabs"><span class="active">선번정보</span><span>송수신기 정보</span></div>
          <div class="field-table field-circuit-table cell-circuit-table"><div class="field-table-head"><span>항목</span><span>노드</span><span>선번</span><span>평면도</span></div>
            <div><span>OTX (주)</span><span>${esc(record.otxMain)}</span><span>${esc(circuitText(record, "otxLine", "otxMain"))}</span><button type="button" data-node-plan="OTX" data-node-value="${esc(record.otxMain)}">이동</button></div>
            <div><span>ORX (주)</span><span>${esc(record.orxMain)}</span><span>${esc(circuitText(record, "orxLine", "orxMain"))}</span><button type="button" data-node-plan="ORX" data-node-value="${esc(record.orxMain)}">이동</button></div>
            <div><span>예비</span><span>${esc(record.backup)}</span><span>${esc(circuitText(record, "backupLine", "backup"))}</span><button type="button" data-node-plan="예비" data-node-value="${esc(record.backup)}">이동</button></div>
          </div>
          <button class="field-line-diagram-btn kt-diagram-btn" data-cell-line-diagram type="button">직선도</button>
          <div class="kt-device-table-title">송수신기 정보</div>
          <div class="field-table field-device-table cell-device-table"><div class="field-table-head"><span>항목</span><span>랙</span><span>쉘프</span><span>포트</span><span>모델명</span><span>평면도</span></div>
            ${["otx", "orx"].map((type) => `<div><span>${type.toUpperCase()}</span><span>${esc(text(record, `${type}Rack`))}</span><span>${esc(text(record, `${type}Shelf`))}</span><span>${esc(text(record, `${type}Port`))}</span><span>${esc(text(record, `${type}Model`))}</span><button type="button" data-rack-equipment="${type}">이동</button></div>`).join("")}
          </div>
        </article>
        <article class="kt-info-card kt-hfc-card"><h2>HFC 현황</h2><div class="kt-hfc-panel">${photoBlock(record, "onu", "ONU")}${photoBlock(record, "ups", "UPS")}</div></article>
        <article class="kt-info-card kt-remarks-card">
          <h2>비고</h2><span class="kt-status-dot" aria-hidden="true"></span>
          <div class="remarks-editor"><textarea id="remarksEditor" aria-label="비고">${esc(record.remarks)}</textarea></div>
          <button id="saveRemarksBtn" type="button" class="kt-save-btn">저장</button>
        </article>
      </section>`;

    qs("#resultPanel").querySelectorAll("[data-rack-equipment]").forEach((button) => button.addEventListener("click", () => renderRackOverview(record, button.dataset.rackEquipment)));
    qs("#resultPanel").querySelectorAll("[data-node-plan]").forEach((button) => button.addEventListener("click", () => renderNodePlanOverview(record, button.dataset.nodeValue, button.dataset.nodePlan)));
    qs("#resultPanel").querySelector("[data-cell-line-diagram]")?.addEventListener("click", () => renderHfcLineDiagram(record, "cell"));
    qs("#saveRemarksBtn").addEventListener("click", () => { updateRecord(record.cellName, { remarks: qs("#remarksEditor").value }); renderRecordEnhanced({ ...record, remarks: qs("#remarksEditor").value }); });
    qs("#resultPanel").querySelectorAll("[data-open-photos]").forEach((button) => button.addEventListener("click", () => openPhotoGallery(record, button.dataset.openPhotos)));
  };

  initFloorPlanTouchZoom = function refreshedFloorPlanTouchZoom(viewport) {
    const target = viewport?.querySelector(".uploaded-image-plan, .uploaded-excel-plan, .floor-plan-world");
    if (!viewport || !target || viewport.dataset.touchZoomReady === "true") return;
    viewport.dataset.touchZoomReady = "true";
    viewport.classList.add("touch-pan-zoom");
    let zoom = 1;
    let minZoom = 0.12;
    let gesture = null;
    let resizeFrame = 0;
    const clampZoom = (value) => Math.min(10, Math.max(minZoom, value));
    const prepareImagePlan = () => {
      const image = target.querySelector("img");
      if (!image?.naturalWidth || !image?.naturalHeight) return;
      target.style.width = `${image.naturalWidth}px`;
      target.style.height = `${image.naturalHeight}px`;
      image.style.width = "100%";
      image.style.height = "100%";
      image.style.maxWidth = "none";
      image.style.maxHeight = "none";
    };
    const unscaledSize = () => {
      const previousZoom = target.style.zoom;
      target.style.zoom = "1";
      prepareImagePlan();
      const rect = target.getBoundingClientRect();
      const width = Math.max(1, target.scrollWidth, rect.width);
      const height = Math.max(1, target.scrollHeight, rect.height);
      target.style.zoom = previousZoom;
      return { width, height };
    };
    const fitZoom = () => {
      const { width, height } = unscaledSize();
      const availableWidth = Math.max(1, viewport.clientWidth - 2);
      const availableHeight = Math.max(1, viewport.clientHeight - 2);
      return Math.min(1, Math.max(0.08, Math.min(availableWidth / width, availableHeight / height) * 0.98));
    };
    const applyZoom = (nextZoom) => {
      zoom = clampZoom(nextZoom);
      target.style.zoom = String(zoom);
    };
    const configure = () => {
      minZoom = fitZoom();
      applyZoom(minZoom);
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    };
    const setZoomAt = (nextZoom, clientX, clientY) => {
      const rect = viewport.getBoundingClientRect();
      const pointX = clientX - rect.left;
      const pointY = clientY - rect.top;
      const oldWidth = Math.max(1, target.getBoundingClientRect().width);
      const oldHeight = Math.max(1, target.getBoundingClientRect().height);
      const anchorX = (viewport.scrollLeft + pointX) / oldWidth;
      const anchorY = (viewport.scrollTop + pointY) / oldHeight;
      applyZoom(nextZoom);
      const newWidth = Math.max(1, target.getBoundingClientRect().width);
      const newHeight = Math.max(1, target.getBoundingClientRect().height);
      viewport.scrollLeft = Math.max(0, (anchorX * newWidth) - pointX);
      viewport.scrollTop = Math.max(0, (anchorY * newHeight) - pointY);
    };
    const distance = (first, second) => Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    const midpoint = (first, second) => ({ x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2 });
    viewport.addEventListener("touchstart", (event) => {
      if (event.touches.length >= 2) {
        gesture = { type: "pinch", distance: Math.max(1, distance(event.touches[0], event.touches[1])), zoom };
        event.preventDefault();
        return;
      }
      if (event.touches.length === 1) {
        gesture = { type: "pan", x: event.touches[0].clientX, y: event.touches[0].clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      }
    }, { passive: false });
    viewport.addEventListener("touchmove", (event) => {
      if (!gesture) return;
      if (gesture.type === "pinch" && event.touches.length >= 2) {
        const center = midpoint(event.touches[0], event.touches[1]);
        setZoomAt(gesture.zoom * (distance(event.touches[0], event.touches[1]) / gesture.distance), center.x, center.y);
        event.preventDefault();
        return;
      }
      if (gesture.type === "pan" && event.touches.length === 1) {
        viewport.scrollLeft = gesture.left - (event.touches[0].clientX - gesture.x);
        viewport.scrollTop = gesture.top - (event.touches[0].clientY - gesture.y);
        event.preventDefault();
      }
    }, { passive: false });
    viewport.addEventListener("touchend", (event) => { if (!event.touches.length) gesture = null; }, { passive: true });
    const image = target.querySelector("img");
    if (image && !image.complete) image.addEventListener("load", configure, { once: true });
    else configure();
    window.addEventListener("resize", () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        const wasAtOverview = zoom <= minZoom + 0.01;
        minZoom = fitZoom();
        if (wasAtOverview) {
          applyZoom(minZoom);
          viewport.scrollLeft = 0;
          viewport.scrollTop = 0;
        }
      });
    }, { passive: true });
  };

  const originalRackOverview = renderRackOverview;
  renderRackOverview = function refreshedRackOverview(record, equipment) {
    originalRackOverview(record, equipment);
    requestAnimationFrame(() => {
      const plan = qs("#rackPanel .floor-plan");
      if (!plan || plan.querySelector(".floor-plan-world, .uploaded-image-plan, .uploaded-excel-plan")) {
        initFloorPlanTouchZoom(plan);
        return;
      }
      const world = document.createElement("div");
      world.className = "floor-plan-world";
      while (plan.firstChild) world.appendChild(plan.firstChild);
      plan.appendChild(world);
      initFloorPlanTouchZoom(plan);
    });
  };
})();
