const { createApp, ref, computed, onMounted, onUnmounted, nextTick } = Vue;

createApp({
  setup() {
    // ===== i18n =====
    const lang = ref(localStorage.getItem('lang') || 'zh');

    function t(key, vars = {}) {
      const str = translations[lang.value]?.[key] ?? translations['zh'][key] ?? key;
      return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    }

    function setLang(l) {
      lang.value = l;
      localStorage.setItem('lang', l);
    }

    // ===== State =====
    const nests = ref([]);
    const tags = ref([]);
    const speciesList = ref([]);
    const filter = ref('all');
    const activeTag = ref(null);
    const activeSpecies = ref(null);
    const gridSize = ref(9);
    const currentPage = ref(1);
    const expandedNest = ref(null);
    const arrangeMode = ref(false);
    const contextMenu = ref({ visible: false, x: 0, y: 0, nest: null });
    const modal = ref({
      visible: false, isEdit: false, nest: null,
      form: { youtube_url: '', name: '', species: '', location: '', notes: '', tag_ids: [] },
      error: ''
    });
    const tagManager = ref({
      visible: false, newName: '', newColor: '#4a90d9', error: ''
    });

    let sortableInstance = null;

    // ===== Computed =====
    const gridCols = computed(() => {
      if (gridSize.value === 4) return 2;
      if (gridSize.value === 9) return 3;
      return 4;
    });

    const viewKey = computed(() => {
      if (activeSpecies.value) return `species_${activeSpecies.value}`;
      if (activeTag.value) return `tag_${activeTag.value}`;
      return filter.value;
    });

    const totalPages = computed(() =>
      Math.max(1, Math.ceil(nests.value.length / gridSize.value))
    );

    const pagedSlots = computed(() => {
      const start = (currentPage.value - 1) * gridSize.value;
      const pageNests = nests.value.slice(start, start + gridSize.value);
      const slots = [...pageNests];
      while (slots.length < gridSize.value) slots.push(null);
      return slots;
    });

    const pageNumbers = computed(() => {
      const total = totalPages.value;
      const cur = currentPage.value;
      if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
      const pages = new Set([1, total, cur]);
      if (cur - 1 > 1) pages.add(cur - 1);
      if (cur + 1 < total) pages.add(cur + 1);
      if (cur - 2 > 1) pages.add(cur - 2);
      if (cur + 2 < total) pages.add(cur + 2);
      const sorted = [...pages].sort((a, b) => a - b);
      const result = [];
      for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('...');
        result.push(sorted[i]);
      }
      return result;
    });

    // ===== Pagination =====
    function goToPage(p) {
      if (p < 1 || p > totalPages.value) return;
      currentPage.value = p;
    }

    function resetPage() { currentPage.value = 1; }

    // ===== Data fetching =====
    async function fetchTags() {
      const res = await fetch('/api/tags');
      tags.value = await res.json();
    }

    async function fetchSpecies() {
      const res = await fetch('/api/nests/species');
      speciesList.value = await res.json();
    }

    async function fetchNests() {
      const params = new URLSearchParams();
      if (filter.value !== 'all') params.set('filter', filter.value);
      if (activeTag.value) params.set('tag', activeTag.value);
      if (activeSpecies.value) params.set('species', activeSpecies.value);
      params.set('view_key', viewKey.value);
      const res = await fetch('/api/nests?' + params.toString());
      nests.value = await res.json();
      if (currentPage.value > totalPages.value) currentPage.value = totalPages.value;
    }

    async function saveOrder() {
      const ids = nests.value.map(n => n.id);
      await fetch(`/api/orders/${encodeURIComponent(viewKey.value)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nest_ids: ids })
      });
    }

    // ===== Filters =====
    function setFilter(f) {
      filter.value = f; activeTag.value = null; activeSpecies.value = null;
      exitArrangeMode(); resetPage(); fetchNests();
    }

    function setTagFilter(tagId) {
      activeTag.value = activeTag.value === tagId ? null : tagId;
      activeSpecies.value = null; filter.value = 'all';
      exitArrangeMode(); resetPage(); fetchNests();
    }

    function setSpeciesFilter(s) {
      activeSpecies.value = activeSpecies.value === s ? null : s;
      activeTag.value = null; filter.value = 'all';
      exitArrangeMode(); resetPage(); fetchNests();
    }

    function setGrid(size) { gridSize.value = size; resetPage(); }

    // ===== Nest interactions =====
    function handleCellClick(nest) {
      if (arrangeMode.value || !nest) return;
      expandedNest.value = nest;
    }

    function handleDrop(event) {
      if (arrangeMode.value) return;
      const url = (event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain') || '').trim();
      if (!url) return;
      openAddModal();
      modal.value.form.youtube_url = url;
    }

    function closeExpand() { expandedNest.value = null; }

    function handleRightClick(event, nest) {
      if (arrangeMode.value || !nest) return;
      contextMenu.value = {
        visible: true,
        x: Math.min(event.clientX, window.innerWidth - 160),
        y: Math.min(event.clientY, window.innerHeight - 150),
        nest
      };
    }

    function closeContextMenu() { contextMenu.value.visible = false; }

    async function toggleOnline(nest) {
      if (!nest) return;
      closeContextMenu();
      await fetch(`/api/nests/${nest.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_online: !nest.is_online })
      });
      fetchNests();
    }

    async function toggleFavorite(nest) {
      if (!nest) return;
      closeContextMenu();
      await fetch(`/api/nests/${nest.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: !nest.is_favorite })
      });
      fetchNests();
    }

    async function deleteNest(nest) {
      if (!nest) return;
      closeContextMenu();
      if (!confirm(t('confirmDeleteNest', { name: nest.name }))) return;
      await fetch(`/api/nests/${nest.id}`, { method: 'DELETE' });
      fetchNests();
    }

    // ===== Modal =====
    function openAddModal() {
      modal.value = {
        visible: true, isEdit: false, nest: null,
        form: { youtube_url: '', name: '', species: '', location: '', notes: '', tag_ids: [] },
        streams: [], error: ''
      };
    }

    function openEditModal(nest) {
      closeContextMenu();
      modal.value = {
        visible: true, isEdit: true, nest,
        form: {
          youtube_url: nest.youtube_url, name: nest.name,
          species: nest.species || '', location: nest.location || '',
          notes: nest.notes || '', tag_ids: (nest.tags || []).map(t => t.id)
        },
        error: ''
      };
    }

    function closeModal() { modal.value.visible = false; }

    async function selectStream(stream) {
      modal.value.form.youtube_url = `https://www.youtube.com/watch?v=${stream.videoId}`;
      modal.value.streams = [];
      await saveModal();
    }

    function toggleTagSelection(tagId) {
      const ids = modal.value.form.tag_ids;
      const idx = ids.indexOf(tagId);
      if (idx === -1) ids.push(tagId); else ids.splice(idx, 1);
    }

    async function saveModal() {
      const { form, isEdit, nest } = modal.value;
      modal.value.error = '';
      if (!form.name.trim()) { modal.value.error = t('errName'); return; }
      if (!isEdit && !form.youtube_url.trim()) { modal.value.error = t('errUrl'); return; }
      try {
        const body = isEdit
          ? { name: form.name, species: form.species, location: form.location, notes: form.notes, tag_ids: form.tag_ids }
          : form;
        const res = await fetch(isEdit ? `/api/nests/${nest.id}` : '/api/nests', {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.streams) {
          modal.value.streams = data.streams;
          return;
        }
        if (!res.ok) {
          modal.value.error = data.error || t('errSaveFailed');
          return;
        }
        closeModal(); fetchNests(); fetchSpecies();
      } catch {
        modal.value.error = t('errNetwork');
      }
    }

    // ===== Arrange mode =====
    function enterArrangeMode() {
      arrangeMode.value = true;
      nextTick(() => initSortable());
    }

    function exitArrangeMode() {
      arrangeMode.value = false;
      destroySortable();
    }

    async function finishArrangeMode() {
      await saveOrder();
      exitArrangeMode();
    }

    function initSortable() {
      const el = document.querySelector('.grid-container');
      if (!el || !window.Sortable) return;
      destroySortable();
      sortableInstance = Sortable.create(el, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd(evt) {
          const moved = nests.value.splice(evt.oldIndex, 1)[0];
          if (moved) nests.value.splice(evt.newIndex, 0, moved);
        }
      });
    }

    function destroySortable() {
      if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
    }

    // ===== Tag manager =====
    function openTagManager() {
      tagManager.value = { visible: true, newName: '', newColor: '#4a90d9', error: '' };
    }

    function closeTagManager() {
      tagManager.value.visible = false;
      fetchTags(); fetchNests();
    }

    async function createTag() {
      const { newName, newColor } = tagManager.value;
      if (!newName.trim()) { tagManager.value.error = t('errTagName'); return; }
      const res = await fetch('/api/tags', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor })
      });
      if (!res.ok) {
        const err = await res.json();
        tagManager.value.error = err.error || t('errSaveFailed');
        return;
      }
      tagManager.value.newName = '';
      tagManager.value.error = '';
      fetchTags();
    }

    async function deleteTag(tag) {
      if (!confirm(t('confirmDeleteTag', { name: tag.name }))) return;
      await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' });
      if (activeTag.value === tag.id) activeTag.value = null;
      fetchTags(); fetchNests();
    }

    // ===== Keyboard =====
    function handleKeydown(e) {
      if (modal.value.visible || tagManager.value.visible || expandedNest.value) {
        if (e.key === 'Escape') {
          if (expandedNest.value) closeExpand();
          else if (modal.value.visible) closeModal();
          else closeTagManager();
        }
        return;
      }
      if (e.key === 'Escape') {
        if (arrangeMode.value) { exitArrangeMode(); return; }
        if (contextMenu.value.visible) { closeContextMenu(); return; }
      }
      if (!arrangeMode.value) {
        if (e.key === 'ArrowRight') goToPage(currentPage.value + 1);
        if (e.key === 'ArrowLeft') goToPage(currentPage.value - 1);
      }
    }

    function handleGlobalClick() {
      if (contextMenu.value.visible) closeContextMenu();
    }

    onMounted(() => {
      fetchTags(); fetchSpecies(); fetchNests();
      document.addEventListener('keydown', handleKeydown);
      document.addEventListener('click', handleGlobalClick);
      setInterval(fetchNests, 5 * 60 * 1000);
    });

    onUnmounted(() => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('click', handleGlobalClick);
      destroySortable();
    });

    return {
      lang, t, setLang,
      nests, tags, speciesList, filter, activeTag, activeSpecies,
      gridSize, gridCols, currentPage, totalPages, pagedSlots, pageNumbers,
      expandedNest, arrangeMode, contextMenu, modal, tagManager,
      goToPage, setFilter, setTagFilter, setSpeciesFilter, setGrid,
      handleCellClick, closeExpand, handleRightClick, handleDrop,
      toggleFavorite, toggleOnline, deleteNest,
      openAddModal, openEditModal, closeModal, toggleTagSelection, saveModal, selectStream,
      enterArrangeMode, exitArrangeMode, finishArrangeMode,
      openTagManager, closeTagManager, createTag, deleteTag
    };
  }
}).mount('#app');
