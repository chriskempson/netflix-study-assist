// ==UserScript==
// @name     Netflix Study Assist
// @author   Chris Kempson (chriskempson.com)
// @version  2.0.0
// @grant    none
// @include  *netflix.com*
// ==/UserScript==

// TODO: Stop space from being clobbered on multiline subtitles for languages that use spaces
// TODO: Detect Subadub language change and call init() (currently needs to be called manually with 'r' key)

// Settings
var pauseIgnoreList = ['♪〜', '〜♪', '♪～', '～♪'];
var pauseOnSubtitleUpdateOnLoad = false;
var hideUserInterfaceOnLoad = true;
var displayLogWindowOnLoad = false;
var showDebugMessagesInLogWindow = false;
var showInfoMessagesInLogWindow = true;
var showTimestampInLogWindow = false;
var pauseType = 'after'; // 'before' pauses before the audio plays, 'after' pauses after the audio plays

// Style subtitles and bring them to foreground so that a popup dictionary can select them
var html = '<style>#subadub-custom-subs { bottom: 1vh !important; } #subadub-custom-subs div { text-shadow: 0 0 10px #000; font-size: 1.25em; background: none !important; font-weight: none !important; -webkit-text-stroke: 0.125em black; paint-order: stroke fill; }</style>';
html += '<style>.player-timedtext-text-container { top: 1% !important; z-index: 1; opacity: 0.1; } .player-timedtext-text-container span { font-size: 3em !important; text-shadow: 0 0 4px #000; -webkit-text-stroke: 0.125em black; paint-order: stroke fill; }</style>';

// Fonts (uncomment/comment as desired)
//html += '<style>#subadub-custom-subs div { font-family: "EPSON 太丸ゴシック体Ｂ", sans-serif; }</style>';
html += '<style>#subadub-custom-subs div { font-family: "MotoyaLMaru W3 mono", sans-serif; }</style>';
//html += '<style>#subadub-custom-subs div { font-family: "Rounded Mplus 1c", sans-serif; }</style>';

// Inject log window
html += '<style>#netflix-study-assist-log { display: none; background: rgba(50,50,50,0.75); border-radius: 5px; position: fixed; top: 0; right: 0; margin: 40px 20px 0 0; color: #eee; padding: 0 10px 8px 10px; z-index: 1; width: 350px; font-size: 15px; } #netflix-study-assist-log-inner { margin-top: 8px; height: 350px; overflow: auto; } #netflix-study-assist-log h1 { font-size: 12px } #netflix-study-assist-log hr { border: none; border-bottom: 1px solid #777; } #netflix-study-assist-log p { margin: 0 0 10px 0; line-height: 20px; } #netflix-study-assist-log .light { color: #aaa; } #netflix-study-assist-log .red { color: #ee2222; } #netflix-study-assist-log .blue { color: #1166cc; } #netflix-study-assist-log .green { color: #227711; }</style><div id="netflix-study-assist-log"><h1>Netflix Study Assist Log</h1><hr /><div id="netflix-study-assist-log-inner"></div></div>';

// Prevent dimmed mode
html += '<style>.PlayerControlsNeo__layout--dimmed { background-color: rgba(0,0,0,0) !important; }</style>';

// TODO: Inject message box (message box should fade)
// html += '';

// Inject HTML
document.body.insertAdjacentHTML('beforeend', html);

// Get page elements
var logWindow = document.getElementById('netflix-study-assist-log');
var logWindowInner = document.getElementById('netflix-study-assist-log-inner');

// Variables
var pauseOnSubtitleUpdate = false;
var logWindowHidden = true;
var player = null;
var textBasedSubtitles = null;
var subtitleObserver = null
var mouseClickHandler = null;
var keydownHandler = null;
var playerControls = null;

console.log('Netflix Study Assist: Loaded');

// Display log window on load
if (displayLogWindowOnLoad) toggleLogWindow();

// Handle keypresses for log window
function loggerKeydownHandler(event) {
  switch (event.key) {
    case 'l': // log toggle
      toggleLogWindow();
      break;

    case 'p': // pause toggle
      togglePauseOnSubtitleUpdate();
      break;

    case 't': // pause type
      togglePauseType();
      break;

    case 'i': // interface toggle
      toggleUserInterfaceVisibility();
      break;

    case 'd': // turn debug messages on
      showDebugMessagesInLogWindow = true;
      break;

    case 'r': // reset
      showDebugMessagesInLogWindow = false;
      init();
      break;
  }
}
document.addEventListener('keydown', loggerKeydownHandler, true);

// Check for URL changes. Wanted to use onpopstate but it wasn't working ;_;
var oldUrl = '';
function checkUrlChange(currentUrl) {
  // Detect navigational page change
  if (currentUrl != oldUrl) {
    log('<span class="light">URL change detected: ' + currentUrl + '</span>', 'debug');
    oldUrl = currentUrl;

    // Start things rolling if we're on the right page...
    if (currentUrl.includes('watch')) {
      log('<span class="light">URL string includes \'watch\', init() called</span>', 'debug');
      init();
    }
  }

  oldUrl = window.location.href;

  // Poll for URL changes
  setTimeout(function () {
    checkUrlChange(window.location.href);
  }, 1000);
}
checkUrlChange(window.location.href);

// Check if player has loaded first
function init() {
  log('<span class="light">Waiting for Netflix video player...<span>', 'info');

  // Remove previous handlers and disconnect previous observers
  if (subtitleObserver) subtitleObserver.disconnect(textBasedSubtitles);
  if (mouseClickHandler) document.removeEventListener('click', mouseClickHandler, true);
  if (keydownHandler) document.removeEventListener('keydown', keydownHandler, true);

  (new MutationObserver(check)).observe(document, { childList: true, subtree: true });
  function check(changes, observer) {

    //if (document.getElementsByTagName('video')[0]) {
    if (document.getElementById('subadub-custom-subs')) {

      // MutationObserver no longer needed
      observer.disconnect();

      log('<span class="light">Netflix video player loaded, ready.<span>', 'info');

      // Hide subadub menu by default
      document.getElementById('subadub-subs-list').style.top = '-100px';

      // Get page elements
      player = document.getElementsByTagName('video')[0];
      // textBasedSubtitles = document.getElementsByClassName('player-timedtext')[0];
      textBasedSubtitles = document.getElementById('subadub-custom-subs');
      playerControls = document.getElementsByClassName('PlayerControlsNeo__all-controls')[0];

      // Handle on load status
      if (pauseOnSubtitleUpdateOnLoad == true) pauseOnSubtitleUpdate = true;
      if (hideUserInterfaceOnLoad == true) toggleUserInterfaceVisibility();

      // Variables
      var lastTextBasedSubtitlesInnerHTML = '';
      var nextTextBasedSubtitlesInnerHTML = '';
      var pausedBySubtitleChange = false;
      var skipNextPause = false;
      var waitForPlayStatus = false;

      // Pause on subtitle changes
      //
      // Netflix updates subtitles even when their player is paused, I've no idea why 
      // they do this. The code below takes this into account and resets
      // Netflix's changes.
      var MutationObserverCallback = function (mutations) {

        // Pause player before the audio has played.
        // Useful when using English audio with Japanese subs as you can read the 
        // Japanese first then have the English played back to you for confirmation.
        if (pauseType == 'before') {

          // Pause condition
          // Pause as soon as the subtitle text changes
          if (textBasedSubtitles.innerHTML != '' && strip(textBasedSubtitles.innerHTML) != strip(lastTextBasedSubtitlesInnerHTML)) {

            if (pauseOnSubtitleUpdate == true && skipNextPause == false) {
              player.pause();
              log(strip(textBasedSubtitles.innerHTML));
              log('<span class="light">Subtitles updated for Pause Condition.</span>', 'debug');
            }

            // Reset so next pause is not skipped
            skipNextPause = false;
          }
        }

        // Pause player after the audio has played.
        // Useful when using Japanese audio with Japanese subs as you can concentrate
        // on listening first, and then read the subtites if needed.
        else if (pauseType == 'after') {

          // First pause condition
          //
          // Pause if text based subtitles have been cleared
          // The first condition should be all we need but for some reason this observer 
          // is triggered multiple times even when the text is '' (possibly due to UI
          // updates). The second condition tries to detect this.
          if (textBasedSubtitles.innerHTML == '' && lastTextBasedSubtitlesInnerHTML != '' && !pauseIgnoreList.includes(strip(lastTextBasedSubtitlesInnerHTML))) {

            if (showDebugMessagesInLogWindow) { log('<span class="red">Pause Condition 1 Triggered:</span><br />' + strip(lastTextBasedSubtitlesInnerHTML), 'debug'); }
            else { log(strip(lastTextBasedSubtitlesInnerHTML)); }

            if (pauseOnSubtitleUpdate == true && skipNextPause == false) {
              player.pause();
              pausedBySubtitleChange = true;

              // Replace text with last text and prevent subtitles from being hidden
              textBasedSubtitles.innerHTML = lastTextBasedSubtitlesInnerHTML;
              textBasedSubtitles.style.display = 'inherit';
              log('<span class="light">Subtitles updated for Pause Condition 1.</span>', 'debug');
            }

            // Reset so next pause is not skipped
            skipNextPause = false;
          }

          // Overwrite Netflix's subtitle updates when we are dealing pause condition 2
          if (nextTextBasedSubtitlesInnerHTML && textBasedSubtitles.innerHTML != lastTextBasedSubtitlesInnerHTML) {
            textBasedSubtitles.innerHTML = lastTextBasedSubtitlesInnerHTML;
            log('<span class="light">Subtitles overwritten for pause condition 2.</span>', 'debug');
          }

          // Second pause condition
          if (strip(textBasedSubtitles.innerHTML) != strip(lastTextBasedSubtitlesInnerHTML) && textBasedSubtitles.innerHTML != '' && lastTextBasedSubtitlesInnerHTML != '' && nextTextBasedSubtitlesInnerHTML == '' && waitForPlayStatus == false) {

            log('<span class="green">Pause Condition 2 (Current Subtitle) Triggered:</span><br />' + strip(textBasedSubtitles.innerHTML), 'debug');
            if (showDebugMessagesInLogWindow) { log('<span class="red">Pause Condition 2 (Last Subtitle) Triggered:</span><br />' + strip(lastTextBasedSubtitlesInnerHTML), 'debug'); }
            else { log(strip(lastTextBasedSubtitlesInnerHTML)); }


            if (pauseOnSubtitleUpdate == true && skipNextPause == false) {
              player.pause();

              // TODO: Not needed?
              // Prevent the second pause condition from being triggered whilst the player is paused
              // waitForPlayStatus = true;

              // Replace text with last text and store next text for display by togglePlayerStatus()
              nextTextBasedSubtitlesInnerHTML = textBasedSubtitles.innerHTML;
              textBasedSubtitles.innerHTML = lastTextBasedSubtitlesInnerHTML;
              log('<span class="light">Subtitles updated for Pause Condition 2.</span>', 'debug');
            }

            // Reset so next pause is not skipped
            skipNextPause = false;
          }
        }

        // Store current subtitles for later
        lastTextBasedSubtitlesInnerHTML = textBasedSubtitles.innerHTML;
      };
      subtitleObserver = new MutationObserver(MutationObserverCallback);
      subtitleObserver.observe(textBasedSubtitles, { childList: true, subtree: true });

      // Player play/pause toggle
      var togglePlayerStatus = function () {
        log('<span class="light">togglePlayerStatus() called</span>', 'debug');


        if (player.paused) {

          player.play();
          log('<span class="light">Resume playback</span>', 'debug');

          // No longer need to halt the checking for pause triggers 
          waitForPlayStatus = false;

          // This condition is met when the player has been paused automatically.
          // On resuming play we no longer need the subtitles to remain on the screen.
          if (textBasedSubtitles.innerHTML == lastTextBasedSubtitlesInnerHTML && pausedBySubtitleChange == true) {

            log('<span class="blue">Resume Condition 1 Triggered</span>', 'debug');

            // Blank subtitles
            textBasedSubtitles.innerHTML = '';

            // Skipe next pause condition to avoid pause being triggered by the line above
            skipNextPause = true;

          }

          // Display next stubtitles on play. This is to meet the second pause condition whereby a subtitle 
          // changes to the next subtitle without clearing to blank.
          if (nextTextBasedSubtitlesInnerHTML) {

            log('<span class="blue">Resume Condition 2 Triggered</span>', 'debug');

            // Replace subtitles with next set of subtiles after playback resumes, by this point
            // subtiles will have been set to previous subtitles
            textBasedSubtitles.innerHTML = nextTextBasedSubtitlesInnerHTML;
            nextTextBasedSubtitlesInnerHTML = '';

            // Skipe next pause condition to avoid pause being triggered by the line above
            skipNextPause = true;
          }

        } else {
          player.pause();
          log('<span class="light">Pause playback</span>', 'debug');
        }

        pausedBySubtitleChange = false;
      };

      // Mouse click toggles play/pause or log window
      mouseClickHandler = function (event) {

        // Left Click
        if (event.button === 0) {
          togglePlayerStatus();
        }

        // Middle click
        else if (event.button === 1) {
          toggleUserInterfaceVisibility();
          event.stopPropagation(); // Required
        }

        // Right click
        else if (event.button === 2) {
          toggleLogWindow();
        }

      };
      document.addEventListener('click', mouseClickHandler, true);

      // Handle keypresses
      keydownHandler = function (event) {

        switch (event.key) {

          // Start/stop player with spacebar even when controls are not showing
          case ' ':
            event.stopPropagation();
            togglePlayerStatus();
            break;
        }
      };
      document.addEventListener('keydown', keydownHandler, true);
    }
  }
}

// Enable or disable automatic pausing when subtitles change 
function togglePauseOnSubtitleUpdate() {
  if (pauseOnSubtitleUpdate == true) {
    pauseOnSubtitleUpdate = false;
    log('<span class="green">Autopause Disabled<span>', 'info');
  }
  else {
    pauseOnSubtitleUpdate = true;
    log('<span class="green">Autopause Enabled<span>', 'info');
  }
}


// Toggle between 'before' and 'after' pause types
function togglePauseType() {
  if (pauseType == 'before') {
    pauseType = 'after';
    log('<span class="green">Autopause Type set to After<span>', 'info');
  }
  else {
    pauseType = 'before';
    log('<span class="green">Autopause Type set to Before<span>', 'info');
  }
}

// Hide or show the Netflix interface controls
function toggleUserInterfaceVisibility(repeatOnce = false) {
  if (typeof playerControls != 'undefined') {

    if (playerControls.style.display == 'none') {

      // Show navigation controls
      playerControls.style.display = 'inherit';

      log('<span class="green">Netflix Player Controls Unhidden<span>', 'info');
    }
    else {

      // Hide navigation controls
      playerControls.style.display = 'none';

      log('<span class="green">Netflix Player Controls Hidden<span>', 'info');
    }
  }

  else if (repeatOnce == false) {
    playerControls = document.getElementsByClassName('PlayerControlsNeo__all-controls')[0];
    log('<span class="green">Netflix Player Controls have not yet loaded, trying again...<span>', 'debug');
    toggleUserInterfaceVisibility(true);
  }
}

// Toggle Log Window
function toggleLogWindow() {
  if (logWindowHidden == true) {
    logWindow.style.display = 'inherit';
    logWindowHidden = false;
    document.getElementById('subadub-subs-list').style.top = '0';
  }
  else {
    logWindow.style.display = 'none';
    logWindowHidden = true;
    document.getElementById('subadub-subs-list').style.top = '-100px';
  }
}

// Strip HTML and leave text
function strip(html) {
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

// Add to log window
function log(message, type = false) {

  // Prevent debug messages from being displayed
  if (showDebugMessagesInLogWindow == false && type == 'debug') return;
  if (showInfoMessagesInLogWindow == false && type == 'info') return;

  if (showTimestampInLogWindow == true) {
    var now = new Date();
    var date = pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2) + ':' + pad(now.getSeconds(), 2);
    if (showDebugMessagesInLogWindow) date += ':' + now.getMilliseconds();
    message = '<span class="light">' + date + ':</span> ' + message;
  }
  logWindowInner.insertAdjacentHTML('afterbegin', '<p>' + message + '</p>');
}

// Pad integers with leading 0s
// https://stackoverflow.com/questions/10073699/pad-a-number-with-leading-zeros-in-javascript#10073788
function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}