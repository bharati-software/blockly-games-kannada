/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Creates a multi-user online pond (online duck page).
 * @author kozbial@google.com (Monica Kozbial)
 */
'use strict';

goog.provide('Pond.Online');

goog.require('Blockly.FlyoutButton');
goog.require('Blockly.utils.Coordinate');
goog.require('Blockly.utils.dom');
goog.require('Blockly.ZoomControls');
goog.require('BlocklyDialogs');
goog.require('BlocklyGames');
goog.require('BlocklyInterface');
goog.require('Pond');
goog.require('Pond.Battle');
goog.require('Pond.Blocks');
goog.require('Pond.Online.soy');
goog.require('Pond.Visualization');


BlocklyGames.NAME = 'pond-online';

/**
 * Array of editor tabs (Blockly and ACE).
 * @type Array.<!Element>
 */
Pond.Online.editorTabs = null;

/**
 * Is the blocks editor the program source (true) or is the JS editor
 * the program source (false).
 * @private
 */
Pond.Online.blocksEnabled_ = true;

/**
 * ACE editor fires change events even on programmatically caused changes.
 * This property is used to signal times when a programmatic change is made.
 */
Pond.Online.ignoreEditorChanges_ = true;

/**
 * Initialize Ace and the pond.  Called on page load.
 */
Pond.Online.init = function() {
  // Render the Soy template.
  document.body.innerHTML = Pond.Online.soy.start({}, null,
      {lang: BlocklyGames.LANG,
        html: BlocklyGames.IS_HTML});

  Pond.init();

  // Setup the tabs.
  function tabHandler(selectedIndex) {
    return function() {
      if (Blockly.utils.dom.hasClass(tabs[selectedIndex], 'tab-disabled')) {
        return;
      }
      for (var i = 0; i < tabs.length; i++) {
        if (selectedIndex == i) {
          Blockly.utils.dom.addClass(tabs[i], 'tab-selected');
        } else {
          Blockly.utils.dom.removeClass(tabs[i], 'tab-selected');
        }
      }
      Pond.Online.changeTab(selectedIndex);
    };
  }
  var tabs = Array.prototype.slice.call(
      document.querySelectorAll('#editorBar>.tab'));
  for (var i = 0; i < tabs.length; i++) {
    BlocklyGames.bindClick(tabs[i], tabHandler(i));
  }
  Pond.Online.editorTabs = tabs;

  var rtl = BlocklyGames.isRtl();
  var visualization = document.getElementById('visualization');
  var tabDiv = document.getElementById('tabarea');
  var blocklyDiv = document.getElementById('blockly');
  var editorDiv = document.getElementById('editor');
  var divs = [blocklyDiv, editorDiv];
  var onresize = function(e) {
    var top = visualization.offsetTop;
    tabDiv.style.top = (top - window.pageYOffset) + 'px';
    tabDiv.style.left = rtl ? '10px' : '420px';
    tabDiv.style.width = (window.innerWidth - 440) + 'px';
    var divTop =
        Math.max(0, top + tabDiv.offsetHeight - window.pageYOffset) + 'px';
    var divLeft = rtl ? '10px' : '420px';
    var divWidth = (window.innerWidth - 440) + 'px';
    for (var i = 0, div; div = divs[i]; i++) {
      div.style.top = divTop;
      div.style.left = divLeft;
      div.style.width = divWidth;
    }
  };
  window.addEventListener('scroll', function() {
    onresize(null);
    Blockly.svgResize(BlocklyGames.workspace);
  });
  window.addEventListener('resize', onresize);
  onresize(null);

  // Inject JS editor.
  var defaultCode = 'cannon(0, 70);';
  BlocklyInterface.editor = window['ace']['edit']('editor');
  BlocklyInterface.editor['setTheme']('ace/theme/chrome');
  BlocklyInterface.editor['setShowPrintMargin'](false);
  var session = BlocklyInterface.editor['getSession']();
  session['setMode']('ace/mode/javascript');
  session['setTabSize'](2);
  session['setUseSoftTabs'](true);
  session['on']('change', Pond.Online.editorChanged);
  BlocklyInterface.editor['setValue'](defaultCode, -1);

  // Lazy-load the ESx-ES5 transpiler.
  BlocklyInterface.importBabel();

  // Inject Blockly.
  var toolbox = document.getElementById('toolbox');
  BlocklyGames.workspace = Blockly.inject('blockly',
      {'media': 'third-party/blockly/media/',
        'oneBasedIndex': false,
        'rtl': false,
        'toolbox': toolbox,
        'trashcan': true,
        'zoom': {'controls': true, 'wheel': true}});
  Blockly.JavaScript.addReservedWords('scan,cannon,drive,swim,stop,speed,' +
      'damage,health,loc_x,getX,loc_y,getY,');

  BlocklyGames.bindClick('createButton', Pond.Online.showCreateDuckForm);
  BlocklyGames.bindClick('updateButton', Pond.Online.showUpdateDuckForm);
  BlocklyGames.bindClick('deleteButton', Pond.Online.showDeleteDuckForm);

  var defaultXml =
      '<xml>' +
      '<block type="pond_cannon" x="70" y="70">' +
      '<value name="DEGREE">' +
      '<shadow type="pond_math_number">' +
      '<mutation angle_field="true"></mutation>' +
      '<field name="NUM">0</field>' +
      '</shadow>' +
      '</value>' +
      '<value name="RANGE">' +
      '<shadow type="pond_math_number">' +
      '<mutation angle_field="false"></mutation>' +
      '<field name="NUM">70</field>' +
      '</shadow>' +
      '</value>' +
      '</block>' +
      '</xml>';
  var xml = Blockly.Xml.textToDom(defaultXml);
  // Clear the workspace to avoid merge.
  BlocklyGames.workspace.clear();
  Blockly.Xml.domToWorkspace(xml, BlocklyGames.workspace);
  BlocklyGames.workspace.clearUndo();

  var players = [
    {
      start: new Blockly.utils.Coordinate(20, 80),
      damage: 0,
      name: 'Pond_myName',
      code: null
    },
    {
      start: new Blockly.utils.Coordinate(80, 80),
      damage: 0,
      name: 'Pond_rookName',
      code: 'playerRook'
    },
    {
      start: new Blockly.utils.Coordinate(20, 20),
      damage: 0,
      name: 'Pond_counterName',
      code: 'playerCounter'
    },
    {
      start: new Blockly.utils.Coordinate(80, 20),
      damage: 0,
      name: 'Pond_sniperName',
      code: 'playerSniper'
    }
  ];

  for (var playerData, i = 0; playerData = players[i]; i++) {
    if (playerData.code) {
      var div = document.getElementById(playerData.code);
      var code = div.textContent;
    } else {
      var code = function() {
        if (Pond.Online.blocksEnabled_) {
          return Blockly.JavaScript.workspaceToCode(BlocklyGames.workspace);
        } else {
          return BlocklyInterface.editor['getValue']();
        }
      };
    }
    var name = BlocklyGames.getMsg(playerData.name);
    Pond.Battle.addAvatar(name, code, playerData.start, playerData.damage);
  }
  Pond.reset();
  Pond.Online.changeTab(0);
  Pond.Online.ignoreEditorChanges_ = false;
};

/**
 * Called by the tab bar when a tab is selected.
 * @param {number} index Which tab is now active (0-1).
 */
Pond.Online.changeTab = function(index) {
  var BLOCKS = 0;
  var JAVASCRIPT = 1;
  // Show the correct tab contents.
  var names = ['blockly', 'editor'];
  for (var i = 0, name; name = names[i]; i++) {
    var div = document.getElementById(name);
    div.style.visibility = (i == index) ? 'visible' : 'hidden';
  }
  // Show/hide Blockly divs.
  var names = ['.blocklyTooltipDiv', '.blocklyToolboxDiv'];
  for (var i = 0, name; name = names[i]; i++) {
    var div = document.querySelector(name);
    div.style.visibility = (index == BLOCKS) ? 'visible' : 'hidden';
  }
  // Synchronize the documentation popup.
  document.getElementById('docsButton').disabled = false;
  BlocklyGames.LEVEL = (index == BLOCKS) ? 11 : 12;
  if (Pond.isDocsVisible_) {
    var frame = document.getElementById('frameDocs');
    frame.src = 'pond/docs.html?lang=' + BlocklyGames.LANG +
        '&mode=' + BlocklyGames.LEVEL;
  }
  // Synchronize the JS editor.
  if (index == JAVASCRIPT && Pond.Online.blocksEnabled_) {
    var code = Blockly.JavaScript.workspaceToCode(BlocklyGames.workspace);
    Pond.Online.ignoreEditorChanges_ = true;
    BlocklyInterface.editor['setValue'](code, -1);
    Pond.Online.ignoreEditorChanges_ = false;
  }
};

/**
 * Change event for JS editor.  Warn the user, then disconnect the link from
 * blocks to JavaScript.
 */
Pond.Online.editorChanged = function() {
  if (Pond.Online.ignoreEditorChanges_) {
    return;
  }
  if (Pond.Online.blocksEnabled_) {
    if (!BlocklyGames.workspace.getTopBlocks(false).length ||
        confirm(BlocklyGames.getMsg('Games_breakLink'))) {
      // Break link between blocks and JS.
      Blockly.utils.dom.addClass(Pond.Online.editorTabs[0], 'tab-disabled');
      Pond.Online.blocksEnabled_ = false;
    } else {
      // Abort change, preserve link.
      var code = Blockly.JavaScript.workspaceToCode(BlocklyGames.workspace);
      Pond.Online.ignoreEditorChanges_ = true;
      BlocklyInterface.editor['setValue'](code, -1);
      Pond.Online.ignoreEditorChanges_ = false;
    }
  } else {
    var code = BlocklyInterface.editor['getValue']();
    if (!code.trim()) {
      // Reestablish link between blocks and JS.
      BlocklyGames.workspace.clear();
      Blockly.utils.dom.removeClass(Pond.Online.editorTabs[0], 'tab-disabled');
      Pond.Online.blocksEnabled_ = true;
    }
  }
};

/**
 * Display a dialog for creating a duck.
 */
Pond.Online.showCreateDuckForm = function() {
  // Encode the user code
  document.getElementById('createJs').value =
      BlocklyInterface.editor['getValue']();
  document.getElementById('createXml').value =
      Pond.Online.blocksEnabled_ ? BlocklyInterface.getXml() : '';

  var content = document.getElementById('duckCreateDialog');
  var style = {
    width: '40%',
    left: '30%',
    top: '3em'
  };

  if (!Pond.Online.showCreateDuckForm.runOnce_) {
    var cancel = document.getElementById('duckCreateCancel');
    cancel.addEventListener('click', BlocklyDialogs.hideDialog, true);
    cancel.addEventListener('touchend', BlocklyDialogs.hideDialog, true);
    var ok = document.getElementById('duckCreateOk');
    ok.addEventListener('click', Pond.Online.duckCreate, true);
    ok.addEventListener('touchend', Pond.Online.duckCreate, true);
    // Only bind the buttons once.
    Pond.Online.showCreateDuckForm.runOnce_ = true;
  }
  var origin = document.getElementById('createButton');
  BlocklyDialogs.showDialog(content, origin, true, true, style);
  // Wait for the opening animation to complete, then focus the title field.
  setTimeout(function() {
    document.getElementById('createName').focus();
  }, 250);
};

/**
 * Display a dialog for updating a duck.
 */
Pond.Online.showUpdateDuckForm = function() {
  // Encode the user code
  document.getElementById('updateJs').value =
      BlocklyInterface.editor['getValue']();
  document.getElementById('updateXml').value =
      Pond.Online.blocksEnabled_ ? BlocklyInterface.getXml() : '';

  var content = document.getElementById('duckUpdateDialog');
  var style = {
    width: '40%',
    left: '30%',
    top: '3em'
  };

  if (!Pond.Online.showUpdateDuckForm.runOnce_) {
    var cancel = document.getElementById('duckUpdateCancel');
    cancel.addEventListener('click', BlocklyDialogs.hideDialog, true);
    cancel.addEventListener('touchend', BlocklyDialogs.hideDialog, true);
    var ok = document.getElementById('duckUpdateOk');
    ok.addEventListener('click', Pond.Online.duckUpdate, true);
    ok.addEventListener('touchend', Pond.Online.duckUpdate, true);
    // Only bind the buttons once.
    Pond.Online.showUpdateDuckForm.runOnce_ = true;
  }
  var origin = document.getElementById('updateButton');
  BlocklyDialogs.showDialog(content, origin, true, true, style);
  // Wait for the opening animation to complete, then focus the title field.
  setTimeout(function() {
    document.getElementById('updateDuckKey').focus();
  }, 250);
};

/**
 * Display a dialog for deleting a duck.
 */
Pond.Online.showDeleteDuckForm = function() {
  var content = document.getElementById('duckDeleteDialog');
  var style = {
    width: '40%',
    left: '30%',
    top: '3em'
  };

  if (!Pond.Online.showDeleteDuckForm.runOnce_) {
    var cancel = document.getElementById('duckDeleteCancel');
    cancel.addEventListener('click', BlocklyDialogs.hideDialog, true);
    cancel.addEventListener('touchend', BlocklyDialogs.hideDialog, true);
    var ok = document.getElementById('duckDeleteOk');
    ok.addEventListener('click', Pond.Online.duckDelete, true);
    ok.addEventListener('touchend', Pond.Online.duckDelete, true);
    // Only bind the buttons once.
    Pond.Online.showDeleteDuckForm.runOnce_ = true;
  }
  var origin = document.getElementById('deleteButton');
  BlocklyDialogs.showDialog(content, origin, true, true, style);
  // Wait for the opening animation to complete, then focus the title field.
  setTimeout(function() {
    document.getElementById('deleteDuckKey').focus();
  }, 250);
};

/**
 * Create a duck form.
 */
Pond.Online.duckCreate = function() {
  // Check that there is a user id.
  var userid = document.getElementById('createUserId');
  if (!userid.value.trim()) {
    userid.value = '';
    userid.focus();
    return;
  }
  // Check that there is a duck name.
  var name = document.getElementById('createName');
  if (!name.value.trim()) {
    name.value = '';
    name.focus();
    return;
  }

  var form = document.getElementById('duckCreateForm');
  var data = [];
  for (var i = 0, element; (element = form.elements[i]); i++) {
    if (element.name) {
      data[i] = encodeURIComponent(element.name) + '=' +
          encodeURIComponent(element.value);
    }
  }
  var xhr = new XMLHttpRequest();
  xhr.open('POST', form.action);
  xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
  xhr.onload = function() {
    if (xhr.readyState == 4) {
      var text;
      if (xhr.status == 200) {
        var meta = JSON.parse(xhr.responseText);
        text = 'Duck created with key: ' + meta['duck_key'];
      } else {
        text = BlocklyGames.getMsg('Games_httpRequestError') + '\nStatus: ' + xhr.status;
      }
      BlocklyDialogs.storageAlert(null, text);
    }
  };
  xhr.send(data.join('&'));
  BlocklyDialogs.hideDialog(true);
};

/**
 * Update a duck form.
 */
Pond.Online.duckUpdate = function() {
  // Check that there is a duck key.
  var duckKey = document.getElementById('updateDuckKey');
  if (!duckKey.value.trim()) {
    duckKey.value = '';
    duckKey.focus();
    return;
  }
  // Check that there is a user id.
  var userid = document.getElementById('updateUserId');
  if (!userid.value.trim()) {
    userid.value = '';
    userid.focus();
    return;
  }

  var form = document.getElementById('duckUpdateForm');
  var data = [];
  for (var i = 0, element; (element = form.elements[i]); i++) {
    if (element.name) {
      data[i] = encodeURIComponent(element.name) + '=' +
          encodeURIComponent(element.value);
    }
  }
  var xhr = new XMLHttpRequest();
  xhr.open('POST', form.action);
  xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
  xhr.onload = function() {
    if (xhr.readyState == 4) {
      var text;
      if (xhr.status == 200) {
        var meta = JSON.parse(xhr.responseText);
        text = 'Duck updated with key: ' + meta['duck_key'];
      } else {
        text = BlocklyGames.getMsg('Games_httpRequestError') + '\nStatus: ' + xhr.status;
      }
      BlocklyDialogs.storageAlert(null, text);
    }
  };
  xhr.send(data.join('&'));
  BlocklyDialogs.hideDialog(true);
};

/**
 * Delete a duck form.
 */
Pond.Online.duckDelete = function() {
  // Check that there is a duck key.
  var duckKey = document.getElementById('deleteDuckKey');
  if (!duckKey.value.trim()) {
    duckKey.value = '';
    duckKey.focus();
    return;
  }
  // Check that there is a user id.
  var userid = document.getElementById('deleteUserId');
  if (!userid.value.trim()) {
    userid.value = '';
    userid.focus();
    return;
  }

  var form = document.getElementById('duckDeleteForm');
  var data = [];
  for (var i = 0, element; (element = form.elements[i]); i++) {
    if (element.name) {
      data[i] = encodeURIComponent(element.name) + '=' +
          encodeURIComponent(element.value);
    }
  }
  var xhr = new XMLHttpRequest();
  xhr.open('POST', form.action);
  xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
  xhr.onload = function() {
    if (xhr.readyState == 4) {
      var text;
      if (xhr.status == 200) {
        var meta = JSON.parse(xhr.responseText);
        text = 'Duck deleted with key: ' + meta['duck_key'];
      } else {
        text = BlocklyGames.getMsg('Games_httpRequestError') + '\nStatus: ' + xhr.status;
      }
      BlocklyDialogs.storageAlert(null, text);
    }
  };
  xhr.send(data.join('&'));
  BlocklyDialogs.hideDialog(true);
};

window.addEventListener('load', Pond.Online.init);