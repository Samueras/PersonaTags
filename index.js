// Persona Tags Extension
// Version 1.0.31
// This extension injects a collapsible tag filter bar into the Persona Management panel,
// displays assigned tag labels on each persona card (clicking a label toggles the filter),
// and injects a "Persona Tag Management" UI into the Persona Description area.
// Global persona tags and persona‑tag assignments are stored in settings.json.
// Changes are persisted via SillyTavern.getContext().saveSettingsDebounced().

(function(){
  console.log("Persona Tags Extension v1.0.31 loaded");

  // Get the SillyTavern context and persistence function.
  const STContext = SillyTavern.getContext();
  const { saveSettingsDebounced } = STContext;
  const settings = STContext.settings || STContext.extensionSettings;
  if (!settings) {
    console.error("No settings provided by SillyTavern.getContext(), cannot proceed.");
    return;
  }

  // Initialize settings keys if needed.
  if (!settings.persona_tag_map) {
    settings.persona_tag_map = {};
    console.log("Initialized persona_tag_map in settings.");
    saveSettingsDebounced();
  }
  if (!settings.persona_tags || !Array.isArray(settings.persona_tags)) {
    settings.persona_tags = [];
    console.log("Initialized persona_tags in settings.");
    saveSettingsDebounced();
  }

  window.selectedPersonaFilterTags = window.selectedPersonaFilterTags || [];
  window.filterBarExpanded = window.filterBarExpanded || false;
  // Preserve the current filter input value globally.
  window.tagFilterValue = window.tagFilterValue || "";
  // Global flag to toggle random color mode; default to light colors.
  window.useLightColors = (window.useLightColors === undefined) ? true : window.useLightColors;

  // Utility to get the persona's unique ID.
  function getPersonaId(card) {
    return card.getAttribute("imgfile") || card.getAttribute("data-avatar-id");
  }

  // -----------------------------
  // Color Utility Functions
  // -----------------------------
  function parseColor(colorStr) {
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
    }
    return [0, 0, 0];
  }
  function getBrightness(rgb) {
    const [r, g, b] = rgb;
    return (r * 299 + g * 587 + b * 114) / 1000;
  }
  function generateRandomDarkColor() {
    let color, brightness;
    do {
      const r = Math.floor(Math.random() * 150);
      const g = Math.floor(Math.random() * 150);
      const b = Math.floor(Math.random() * 150);
      color = "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
      brightness = getBrightness([r, g, b]);
    } while (brightness > 128);
    return color;
  }
  function generateRandomLightColor() {
    let color, brightness;
    do {
      const r = Math.floor(Math.random() * 106) + 150;
      const g = Math.floor(Math.random() * 106) + 150;
      const b = Math.floor(Math.random() * 106) + 150;
      color = "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
      brightness = getBrightness([r, g, b]);
    } while (brightness < 200);
    return color;
  }
  // New helper to generate a random color based on current mode.
  function generateRandomColor() {
    return window.useLightColors ? generateRandomLightColor() : generateRandomDarkColor();
  }
  // Existing contrasting color function remains unchanged.
  function generateRandomContrastingColor() {
    const mainTextColor = (settings.power_user && settings.power_user.main_text_color) || "rgba(0, 0, 0, 1)";
    const rgb = parseColor(mainTextColor);
    return getBrightness(rgb) > 128 ? generateRandomDarkColor() : generateRandomLightColor();
  }

  // -----------------------------
  // UI Injection Functions
  // -----------------------------
  function renderTagFilterBar() {
    const target = document.querySelector("#persona-management-block .flex-container.marginBot10.alignitemscenter");
    if (!target) {
      console.error("Target container for tag filter bar not found.");
      return;
    }
    const existingBar = document.getElementById("persona-tag-filter-bar");
    if (existingBar) existingBar.remove();

    const filterBar = document.createElement("div");
    filterBar.id = "persona-tag-filter-bar";

    // Create header row that always displays the toggle button.
    // When expanded, the header also shows the filter input field next to the toggle button.
    const headerRow = document.createElement("div");
    headerRow.id = "tag-filter-header";
    headerRow.style.display = "flex";
    headerRow.style.alignItems = "center";
    headerRow.style.gap = "10px";

    // Toggle button.
    const toggleBtn = document.createElement("button");
    toggleBtn.id = "toggle-tag-filter";
    toggleBtn.textContent = window.filterBarExpanded ? "Hide Tags" : "Show Tags";
    toggleBtn.classList.add("menu_button", "interactable");
    toggleBtn.onclick = function(){
      window.filterBarExpanded = !window.filterBarExpanded;
      renderTagFilterBar();
    };
    headerRow.appendChild(toggleBtn);

    // If tags are visible, add the filter input field next to the toggle button.
    let tagContainer; // used in filterInput event listener
    if (window.filterBarExpanded) {
      const filterWrapper = document.createElement("div");
      filterWrapper.classList.add("tag-filter-input-wrapper", "text_pole");
      const filterInput = document.createElement("input");
      filterInput.type = "text";
      filterInput.placeholder = "Filter tags...";
      filterInput.style.width = "100px"; // shorter input
      filterInput.value = window.tagFilterValue;
      filterInput.addEventListener("input", function(){
        window.tagFilterValue = filterInput.value;
        const value = filterInput.value.toLowerCase();
        if(tagContainer) {
          Array.from(tagContainer.children).forEach(btn => {
            const tagName = btn.textContent.split(" (")[0].toLowerCase();
            btn.style.display = tagName.includes(value) ? "" : "none";
          });
        }
      });
      // Ensure proper focus on touch devices.
      filterInput.addEventListener("touchstart", function(e) {
        e.stopPropagation();
        e.preventDefault();
        filterInput.focus();
      });
      filterWrapper.appendChild(filterInput);
      const clearButton = document.createElement("span");
      clearButton.textContent = "×";
      clearButton.className = "clear-filter";
      clearButton.onclick = function(){
        filterInput.value = "";
        window.tagFilterValue = "";
        if(tagContainer) {
          Array.from(tagContainer.children).forEach(btn => {
            btn.style.display = "";
          });
        }
      };
      filterWrapper.appendChild(clearButton);
      headerRow.appendChild(filterWrapper);
    }

    filterBar.appendChild(headerRow);

    // If tags are visible, add the tag container below the header row.
    if (window.filterBarExpanded) {
      tagContainer = document.createElement("div");
      tagContainer.id = "tag-filter-container";
      tagContainer.style.marginTop = "5px";
      cleanupUnusedGlobalTags();
      settings.persona_tags.forEach(tag => {
        const btn = document.createElement("button");
        btn.classList.add("persona-tag-btn", "menu_button", "interactable");
        if (window.selectedPersonaFilterTags.includes(tag.id)) {
          btn.classList.add("selected");
        }
        const usage = getTagUsageCount(tag.id);
        btn.textContent = `${tag.name} (${usage})`;
        btn.style.backgroundColor = tag.color;
        btn.dataset.tagId = tag.id;
        btn.onclick = function(){
          if (btn.classList.contains("selected")) {
            btn.classList.remove("selected");
            window.selectedPersonaFilterTags = window.selectedPersonaFilterTags.filter(t => t !== tag.id);
            console.log("Filter bar: Removed tag filter for", tag.id);
          } else {
            btn.classList.add("selected");
            if (!window.selectedPersonaFilterTags.includes(tag.id)) {
              window.selectedPersonaFilterTags.push(tag.id);
            }
            console.log("Filter bar: Added tag filter for", tag.id);
          }
          filterPersonas();
        };
        tagContainer.appendChild(btn);
      });
      if (window.tagFilterValue) {
        const filterVal = window.tagFilterValue.toLowerCase();
        Array.from(tagContainer.children).forEach(btn => {
          const tagName = btn.textContent.split(" (")[0].toLowerCase();
          btn.style.display = tagName.includes(filterVal) ? "" : "none";
        });
      }
      filterBar.appendChild(tagContainer);
    }

    target.parentNode.insertBefore(filterBar, target.nextSibling);

    if (window.tagFilterValue && window.filterBarExpanded) {
      const filterInput = filterBar.querySelector("input[type='text']");
      if (filterInput) {
        filterInput.focus();
      }
    }
    console.log("Tag Filter Bar rendered under target container.");
  }

  function renderPersonaCards(){
    cleanupUnusedGlobalTags();
    document.querySelectorAll(".avatar-container.interactable").forEach(card => {
      const personaId = getPersonaId(card);
      const oldLabels = card.querySelector(".persona-tag-labels");
      if (oldLabels) oldLabels.remove();

      const labelContainer = document.createElement("div");
      labelContainer.className = "persona-tag-labels";
      const assignedTags = settings.persona_tag_map[personaId] || [];
      console.log("Rendering persona card for", personaId, "with assigned tags:", assignedTags);
      assignedTags.forEach(tagId => {
        const tagObj = settings.persona_tags.find(t => t.id === tagId);
        if (tagObj) {
          const span = document.createElement("span");
          span.className = "persona-tag-label";
          span.textContent = tagObj.name;
          span.style.backgroundColor = tagObj.color;
          span.style.border = "1px solid #fff";
          span.style.cursor = "pointer";
          span.onclick = function(e){
            e.stopPropagation();
            if (window.selectedPersonaFilterTags.includes(tagObj.id)) {
              window.selectedPersonaFilterTags = window.selectedPersonaFilterTags.filter(t => t !== tagObj.id);
              document.querySelectorAll(".persona-tag-btn").forEach(btn => {
                if (btn.dataset.tagId === tagObj.id) btn.classList.remove("selected");
              });
              console.log("Persona card: Removed tag filter for", tagObj.id);
            } else {
              window.selectedPersonaFilterTags.push(tagObj.id);
              document.querySelectorAll(".persona-tag-btn").forEach(btn => {
                if (btn.dataset.tagId === tagObj.id) btn.classList.add("selected");
              });
              console.log("Persona card: Added tag filter for", tagObj.id);
            }
            filterPersonas();
          };
          labelContainer.appendChild(span);
        }
      });
      const nameElem = card.querySelector(".ch_name");
      if (nameElem) nameElem.after(labelContainer);

      card.addEventListener("click", function(){
        document.querySelectorAll(".avatar-container.interactable").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
        renderPersonaTagManagementUI();
      });
    });
    console.log("Persona cards rendered with tag labels.");
  }

  function renderPersonaTagManagementUI(){
    const selectedCard = document.querySelector(".avatar-container.interactable.selected");
    if (!selectedCard) {
      console.log("No persona selected for tag management.");
      return;
    }
    const personaId = getPersonaId(selectedCard);
    console.log("Rendering Tag Management UI for persona:", personaId);

    const descTextarea = document.getElementById("persona_description");
    if (!descTextarea) {
      console.error("Persona description textarea (#persona_description) not found.");
      return;
    }
    const descPanel = descTextarea.parentElement;
    let tagMgmtDiv = document.getElementById("persona-tag-management");
    let preservedInput = "";
    let preservedColor = "";
    if (tagMgmtDiv && tagMgmtDiv.dataset.personaId !== personaId) {
      tagMgmtDiv.remove();
      tagMgmtDiv = null;
    }
    if (tagMgmtDiv) {
      const newTagInput = tagMgmtDiv.querySelector("#new-tag-input");
      if (newTagInput) preservedInput = newTagInput.value;
      const newTagColor = tagMgmtDiv.querySelector("#new-tag-color");
      if (newTagColor) preservedColor = newTagColor.value;
      tagMgmtDiv.querySelector("#assigned-tags-container").innerHTML = "";
      tagMgmtDiv.querySelector("#available-tags-container").innerHTML = "";
    } else {
      tagMgmtDiv = document.createElement("div");
      tagMgmtDiv.id = "persona-tag-management";
      tagMgmtDiv.dataset.personaId = personaId;
      
      const assignedHeader = document.createElement("h4");
      assignedHeader.textContent = "Assigned Tags:";
      tagMgmtDiv.appendChild(assignedHeader);
      const assignedContainer = document.createElement("div");
      assignedContainer.id = "assigned-tags-container";
      tagMgmtDiv.appendChild(assignedContainer);
      const availableHeader = document.createElement("h4");
      availableHeader.textContent = "Available Global Tags:";
      tagMgmtDiv.appendChild(availableHeader);
      const availableContainer = document.createElement("div");
      availableContainer.id = "available-tags-container";
      tagMgmtDiv.appendChild(availableContainer);
      const newTagDiv = document.createElement("div");
      newTagDiv.id = "new-tag-div";
      newTagDiv.classList.add("text_pole");
      const newTagInput = document.createElement("input");
      newTagInput.id = "new-tag-input";
      newTagInput.placeholder = "New tag title";
      // Add listener for Enter key to add tag automatically.
      newTagInput.addEventListener("keydown", function(e) {
        if(e.key === "Enter") {
          e.preventDefault();
          addNewTag();
        }
      });
      newTagDiv.appendChild(newTagInput);
      const newTagColor = document.createElement("input");
      newTagColor.id = "new-tag-color";
      newTagColor.type = "color";
      newTagColor.value = preservedColor || generateRandomColor();
      newTagDiv.appendChild(newTagColor);
      // New toggle color button, styled like the Add Tag button.
      const toggleColorBtn = document.createElement("button");
      toggleColorBtn.classList.add("menu_button", "interactable", "add-tag-btn");
      toggleColorBtn.textContent = window.useLightColors ? "Light Colors" : "Dark Colors";
      toggleColorBtn.onclick = function(){
        window.useLightColors = !window.useLightColors;
        toggleColorBtn.textContent = window.useLightColors ? "Light Colors" : "Dark Colors";
        newTagColor.value = generateRandomColor();
      };
      newTagDiv.appendChild(toggleColorBtn);
      const addTagBtn = document.createElement("button");
      addTagBtn.textContent = "Add Tag";
      addTagBtn.classList.add("menu_button", "interactable", "add-tag-btn");
      addTagBtn.onclick = addNewTag;
      newTagDiv.appendChild(addTagBtn);
      tagMgmtDiv.appendChild(newTagDiv);
      descPanel.appendChild(tagMgmtDiv);

      // Helper function to add new tag.
      function addNewTag() {
        const title = newTagInput.value.trim();
        const color = newTagColor.value || generateRandomColor();
        if (!title) return;
        const newId = "tag" + (settings.persona_tags.length + 1);
        const newTag = { id: newId, name: title, color: color };
        settings.persona_tags.push(newTag);
        console.log("Before saveSettingsDebounced after adding new global tag");
        saveSettingsDebounced();
        console.log("After saveSettingsDebounced after adding new global tag");

        if (!settings.persona_tag_map[personaId]) {
          settings.persona_tag_map[personaId] = [];
        }
        settings.persona_tag_map[personaId].push(newId);
        console.log("Before saveSettingsDebounced after updating persona_tag_map");
        saveSettingsDebounced();
        console.log("After saveSettingsDebounced after updating persona_tag_map");

        newTagInput.value = "";
        newTagColor.value = generateRandomColor();
        renderPersonaTagManagementUI();
        renderTagFilterBar();
        renderPersonaCards();
      }
    }
    const newTagInputField = tagMgmtDiv.querySelector("#new-tag-input");
    if (newTagInputField) newTagInputField.value = preservedInput;
    
    const assignedContainer = tagMgmtDiv.querySelector("#assigned-tags-container");
    (settings.persona_tag_map[personaId] || []).forEach(tagId => {
      const tagObj = settings.persona_tags.find(t => t.id === tagId);
      if (tagObj) {
        const span = document.createElement("span");
        span.className = "persona-tag-label";
        span.textContent = tagObj.name;
        span.style.backgroundColor = tagObj.color;
        span.style.border = "1px solid #fff";
        span.onclick = function(){
          settings.persona_tag_map[personaId] = (settings.persona_tag_map[personaId] || []).filter(t => t !== tagObj.id);
          console.log("Before saveSettingsDebounced after removing a tag from persona_tag_map");
          saveSettingsDebounced();
          console.log("After saveSettingsDebounced after removing a tag from persona_tag_map");
          renderPersonaCards();
          renderPersonaTagManagementUI();
        };
        assignedContainer.appendChild(span);
      }
    });
    
    const availableContainer = tagMgmtDiv.querySelector("#available-tags-container");
    settings.persona_tags.forEach(tag => {
      const btn = document.createElement("button");
      btn.classList.add("global-tag-btn", "menu_button", "interactable");
      const usage = getTagUsageCount(tag.id);
      btn.textContent = `${tag.name} (${usage})`;
      btn.style.backgroundColor = tag.color;
      btn.dataset.tagId = tag.id;
      if ((settings.persona_tag_map[personaId] || []).includes(tag.id)) {
        btn.classList.add("active");
      }
      btn.onclick = function(){
        let personaTags = settings.persona_tag_map[personaId] || [];
        if (personaTags.includes(tag.id)) {
          personaTags = personaTags.filter(t => t !== tag.id);
        } else {
          personaTags.push(tag.id);
        }
        settings.persona_tag_map[personaId] = personaTags;
        console.log("Before saveSettingsDebounced after toggling tag assignment");
        saveSettingsDebounced();
        console.log("After saveSettingsDebounced after toggling tag assignment");
        renderPersonaCards();
        renderPersonaTagManagementUI();
      };
      availableContainer.appendChild(btn);
    });
    console.log("Persona Tag Management UI rendered for persona:", personaId);
  }
  
  function filterPersonas(){
    const selected = window.selectedPersonaFilterTags;
    document.querySelectorAll(".avatar-container.interactable").forEach(card => {
      const personaId = getPersonaId(card);
      const assigned = settings.persona_tag_map[personaId] || [];
      const matches = selected.every(tag => assigned.includes(tag));
      card.style.display = matches ? "" : "none";
    });
    console.log("Filtering personas. Selected tags:", selected);
  }
  
  function cleanupUnusedGlobalTags(){
    let updated = false;
    settings.persona_tags = settings.persona_tags.filter(tag => {
      const count = getTagUsageCount(tag.id);
      if (count === 0) {
        updated = true;
        return false;
      }
      return true;
    });
    if (updated) {
      console.log("Before saveSettingsDebounced after cleaning up unused tags");
      saveSettingsDebounced();
      console.log("After saveSettingsDebounced after cleaning up unused tags");
    }
  }

  function getTagUsageCount(tagId) {
    let count = 0;
    for (const persona in settings.persona_tag_map) {
      if (settings.persona_tag_map[persona].includes(tagId)) count++;
    }
    return count;
  }
  
  function initPersonaTags(){
    console.log("Initializing Persona Tags UI...");
    renderTagFilterBar();
    renderPersonaCards();
    filterPersonas();
  }
  
  function waitForPersonaPanel(){
    const panel = document.querySelector("#persona-management-block");
    if (panel && window.getComputedStyle(panel).display !== "none") {
      console.log("Persona management panel is visible. Initializing UI...");
      initPersonaTags();
    } else {
      console.log("Waiting for persona management panel...");
      setTimeout(waitForPersonaPanel, 1000);
    }
  }
  document.addEventListener("DOMContentLoaded", waitForPersonaPanel);
  
  function attachDrawerListener(){
    const drawerButton = document.getElementById("persona-management-button");
    if (drawerButton) {
      drawerButton.addEventListener("click", function(){
        console.log("Persona management drawer button clicked.");
        setTimeout(function(){
          const panel = document.querySelector("#persona-management-block");
          if (panel && window.getComputedStyle(panel).display !== "none") {
            console.log("Persona management panel is now visible (via drawer click).");
            initPersonaTags();
          } else {
            console.warn("Panel not visible after drawer click.");
          }
        }, 500);
      });
      console.log("Attached click listener to #persona-management-button.");
    } else {
      console.error("Persona management button (#persona-management-button) not found.");
    }
  }
  attachDrawerListener();
  document.addEventListener("personasUpdated", initPersonaTags);

})();
