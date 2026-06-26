$(document).ready(function() {
  
  // ==========================================
  // MAPEO DE BANDERAS (FLAGCDN)
  // ==========================================
  const TEAM_CODES = {
    "Mexico": "mx",
    "South Africa": "za",
    "South Korea": "kr",
    "Czech Republic": "cz",
    "Czechia": "cz",
    "Canada": "ca",
    "Bosnia & Herzegovina": "ba",
    "Qatar": "qa",
    "Switzerland": "ch",
    "Brazil": "br",
    "Morocco": "ma",
    "Haiti": "ht",
    "Scotland": "gb-sct",
    "USA": "us",
    "Paraguay": "py",
    "Australia": "au",
    "Turkey": "tr",
    "Türkiye": "tr",
    "Germany": "de",
    "Curaçao": "cw",
    "Ivory Coast": "ci",
    "Ecuador": "ec",
    "Netherlands": "nl",
    "Japan": "jp",
    "Sweden": "se",
    "Tunisia": "tn",
    "Belgium": "be",
    "Egypt": "eg",
    "Iran": "ir",
    "New Zealand": "nz",
    "Spain": "es",
    "Cape Verde": "cv",
    "Saudi Arabia": "sa",
    "Uruguay": "uy",
    "France": "fr",
    "Senegal": "sn",
    "Iraq": "iq",
    "Norway": "no",
    "Argentina": "ar",
    "Algeria": "dz",
    "Austria": "at",
    "Jordan": "jo",
    "Portugal": "pt",
    "DR Congo": "cd",
    "Uzbekistan": "uz",
    "Colombia": "co",
    "England": "gb-eng",
    "Croatia": "hr",
    "Ghana": "gh",
    "Panama": "pa",
    "Italy": "it"
  };

  // Función Helper para renderizar Banderas
  function getTeamFlagHTML(teamName) {
    const isPlaceholder = /^[0-9WLa-z\/]+$/.test(teamName) || teamName.includes('/');
    
    if (isPlaceholder) {
      return `<div class="team-flag-placeholder"><i data-lucide="help-circle" style="width: 13px; height: 13px; opacity:0.6;"></i></div>`;
    }

    let cleanName = teamName;
    if (teamName === "Czech Republic") cleanName = "Czechia";
    if (teamName === "Turkey") cleanName = "Türkiye";

    const code = TEAM_CODES[cleanName];
    if (code) {
      return `<img src="https://flagcdn.com/w40/${code}.png" class="team-flag-img" alt="Bandera de ${teamName}">`;
    }

    const initials = teamName.substring(0, 3).toUpperCase();
    return `<div class="team-flag-placeholder">${initials}</div>`;
  }

  // Mostrar Toast Notification
  function showToast(message, type = 'success') {
    const id = 'toast-' + Date.now();
    const icon = type === 'success' ? 'check-circle' : 'alert-circle';
    const errorClass = type === 'error' ? 'toast-error' : '';

    const toastHTML = `
      <div id="${id}" class="toast ${errorClass}" style="opacity: 0; transform: translateY(20px);">
        <i data-lucide="${icon}"></i>
        <span>${message}</span>
      </div>
    `;

    $('#toast-container').append(toastHTML);
    lucide.createIcons();

    const element = $(`#${id}`);
    element.animate({
      opacity: 1,
      transform: 'translateY(0)'
    }, 200);

    setTimeout(() => {
      element.addClass('toast-hide');
      setTimeout(() => {
        element.remove();
      }, 500);
    }, 3000);
  }

  // ==========================================
  // 1. ESTADO Y CONFIGURACIÓN INICIAL
  // ==========================================
  
  let state = {
    players: [],
    realResults: {},
    matchTeams: {},
    config: {
      pointsExact: 3,
      pointsWinner: 1,
      pointsClosest: 1,
      pointsChampion: 10,
      adminPin: '1234',
      theme: 'dark'
    },
    realChampion: null
  };

  let activePlayerId = null;
  let isAdminMode = false; // Estado de sesión del administrador
  let dbConnected = false; // Estado de conexión a la BD
  let adminLoginSuccessCallback = null;
  let adminLoginCancelCallback = null;

  let chartChampionVotes = null;
  let chartTeamPopularity = null;
  let chartMatchDistribution = null;
  let chartTopScorers = null;
  let chartGoalsByMinute = null;
  let chartTeamCards = null;

  // Cargar estado desde LocalStorage
  function loadState(callback) {
    try {
      $.ajax({
        url: 'api.php?action=get',
        type: 'GET',
        dataType: 'json',
        cache: false,
        success: function(data) {
          if (data && !data.status) { // Si no es un JSON con error
            state = data;
            if (!state.players) state.players = [];
            state.players.forEach(p => {
              if (!p.predictions) p.predictions = {};
            });
            if (!state.realResults) state.realResults = {};
            if (!state.matchTeams) state.matchTeams = {};
            if (!state.config) {
              state.config = { pointsExact: 3, pointsWinner: 1, pointsClosest: 1, pointsChampion: 10, adminPin: '1234', theme: 'dark' };
            }
            if (state.config.pointsClosest === undefined) {
              state.config.pointsClosest = 1;
            }
            if (state.config.pointsChampion === undefined) {
              state.config.pointsChampion = 10;
            }
            if (state.config.adminPin === undefined) {
              state.config.adminPin = '1234';
            }
            if (state.config.championVotingClosed === undefined) {
              state.config.championVotingClosed = false;
            }
            if (state.realChampion === undefined) {
              state.realChampion = null;
            }
            console.log("Estado cargado exitosamente desde la base de datos MySQL.");
          } else {
            console.warn("Respuesta inválida del servidor, usando LocalStorage.");
            loadStateFromLocalStorage();
            if (data && data.status === 'error') {
              showToast("Error de base de datos: " + data.message, "error");
            }
          }
          finishLoading();
        },
        error: function(xhr, status, error) {
          console.warn("No se pudo conectar con api.php, usando LocalStorage.");
          loadStateFromLocalStorage();
          finishLoading();
        }
      });
    } catch (e) {
      console.warn("Error ejecutando $.ajax de carga (CORS o restricción local), usando LocalStorage.", e);
      loadStateFromLocalStorage();
      finishLoading();
    }

    function loadStateFromLocalStorage() {
      const saved = localStorage.getItem('quiniela_wc2026_state');
      if (saved) {
        try {
          state = JSON.parse(saved);
          if (!state.players) state.players = [];
          state.players.forEach(p => {
            if (!p.predictions) p.predictions = {};
          });
          if (!state.realResults) state.realResults = {};
          if (!state.matchTeams) state.matchTeams = {};
          if (!state.config) {
            state.config = { pointsExact: 3, pointsWinner: 1, pointsClosest: 1, pointsChampion: 10, adminPin: '1234', theme: 'dark' };
          }
          if (state.config.pointsClosest === undefined) {
            state.config.pointsClosest = 1;
          }
          if (state.config.pointsChampion === undefined) {
            state.config.pointsChampion = 10;
          }
          if (state.config.adminPin === undefined) {
            state.config.adminPin = '1234';
          }
          if (state.config.championVotingClosed === undefined) {
            state.config.championVotingClosed = false;
          }
          if (state.realChampion === undefined) {
            state.realChampion = null;
          }
        } catch (e) {
          initializeDefaultState();
        }
      } else {
        initializeDefaultState();
      }
    }

    function finishLoading() {
      syncOfficialMatches();
      // Restaurar modo administrador desde sessionStorage (persiste mientras la pestaña esté abierta)
      isAdminMode = sessionStorage.getItem('quiniela_isAdmin') === 'true';
      
      activePlayerId = null;
      if (typeof callback === 'function') {
        callback();
      }
    }
  }

  function initializeDefaultState() {
    state = {
      players: [],
      realResults: {},
      matchTeams: {},
      config: {
        pointsExact: 3,
        pointsWinner: 1,
        pointsClosest: 1,
        pointsChampion: 10,
        adminPin: '1234',
        theme: 'dark',
        championVotingClosed: false
      },
      realChampion: null
    };
  }

  function syncOfficialMatches() {
    if (typeof WORLD_CUP_2026_MATCHES !== 'undefined') {
      WORLD_CUP_2026_MATCHES.forEach(match => {
        if (!state.realResults[match.id]) {
          state.realResults[match.id] = {
            goals1: match.goals1,
            goals2: match.goals2,
            status: match.goals1 !== null && match.goals2 !== null ? 'finished' : 'scheduled'
          };
        }
      });
    }
  }

  // Normalizar nombres de equipos para comparar con APIs externas
  function normalizeTeamName(name) {
    if (!name) return "";
    let n = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    
    if (n === "united states" || n === "usa" || n === "us") return "usa";
    if (n === "bosnia-herzegovina" || n === "bosnia and herzegovina" || n === "bosnia & herzegovina") return "bosnia & herzegovina";
    if (n === "korea republic" || n === "south korea" || n === "korea, republic of") return "south korea";
    if (n === "czechia" || n === "czech republic") return "czech republic";
    if (n === "ivory coast" || n === "cote d'ivoire" || n === "cote divoire") return "ivory coast";
    if (n === "turkiye" || n === "turquia" || n === "turkey") return "turkey";
    if (n === "saudi arabia" || n === "arabia saudita") return "saudi arabia";
    if (n === "congo dr" || n === "dr congo") return "dr congo";
    
    return n;
  }

  // Obtener el nombre del equipo, considerando si hay uno editado en la base de datos
  function getTeamName(matchId, teamNum, defaultName) {
    if (state.matchTeams && state.matchTeams[matchId]) {
      const customName = teamNum === 1 ? state.matchTeams[matchId].team1 : state.matchTeams[matchId].team2;
      if (customName !== undefined && customName !== null && customName.trim() !== "") {
        return customName.trim();
      }
    }
    return defaultName;
  }

  // Guardar estado en LocalStorage y Base de Datos (MySQL) con endpoints dedicados
  function saveState(changeCtx) {
    // 1. Guardar en LocalStorage como copia local / offline de forma inmediata
    localStorage.setItem('quiniela_wc2026_state', JSON.stringify(state));
    
    // 2. Determinar endpoint y payload específico para la base de datos MySQL
    const ctx = changeCtx || {};
    let url = null; // Sin fallback peligroso — si no hay contexto conocido, no se envía nada al servidor
    let payload = null;

    if (ctx.type === 'prediction') {
      const { playerId, matchId } = ctx;
      if (playerId !== undefined && playerId !== null && matchId !== undefined && matchId !== null) {
        url = 'api.php?action=save_prediction';
        const player = state.players.find(p => p.id == playerId);
        const pred = player ? player.predictions[matchId] : null;
        if (pred) {
          payload = {
            player_id: playerId,
            match_id: matchId,
            goals1: pred.goals1,
            goals2: pred.goals2,
            unlocked: !!pred.unlocked,
            is_admin: isAdminMode
          };
        } else {
          payload = {
            player_id: playerId,
            match_id: matchId,
            delete: true,
            is_admin: isAdminMode
          };
        }
      }
    } else if (ctx.type === 'champion-vote') {
      const { playerId } = ctx;
      if (playerId !== undefined && playerId !== null) {
        url = 'api.php?action=save_champion_vote';
        const player = state.players.find(p => p.id == playerId);
        if (player) {
          payload = {
            player_id: playerId,
            championPrediction: player.championPrediction,
            championPredictionText: player.championPredictionText,
            championPredictionId: player.championPredictionId
          };
        }
      }
    } else if (ctx.type === 'real-results') {
      url = 'api.php?action=save_real_result';
      const { matchId } = ctx;
      if (matchId === 'all') {
        payload = {
          match_id: 'all',
          reset: true
        };
      } else if (matchId !== undefined && matchId !== null) {
        const res = state.realResults[matchId];
        payload = {
          match_id: matchId,
          goals1: res ? res.goals1 : null,
          goals2: res ? res.goals2 : null,
          status: res ? res.status : 'scheduled',
          api_data: res ? res.api_data : null
        };
      }
    } else if (ctx.type === 'match-teams') {
      url = 'api.php?action=save_match_team';
      const { matchId } = ctx;
      if (matchId !== undefined && matchId !== null) {
        const t = state.matchTeams[matchId];
        payload = {
          match_id: matchId,
          team1: t ? t.team1 : null,
          team2: t ? t.team2 : null
        };
      }
    } else if (ctx.type === 'config') {
      url = 'api.php?action=save_config';
      payload = state.config;
    } else if (ctx.type === 'real-champion') {
      url = 'api.php?action=save_real_champion';
      payload = {
        realChampion: state.realChampion
      };
    } else if (ctx.type === 'add-player') {
      url = 'api.php?action=add_player';
      payload = {
        id: ctx.player.id,
        name: ctx.player.name
      };
    } else if (ctx.type === 'delete-player') {
      url = 'api.php?action=delete_player';
      payload = {
        id: ctx.playerId
      };
    } else if (ctx.type === 'reset-players') {
      url = 'api.php?action=reset_players';
      payload = {};
    } else if (ctx.type === 'full-overwrite') {
      url = 'api.php?action=import_state';
      payload = state;
    }

    try {
      if (!url || !payload) {
        // Sin contexto reconocido — no enviamos nada al servidor para evitar sobrescrituras accidentales
        console.warn(`[Quiniela DB Skip] saveState() llamado sin contexto reconocido (tipo: "${ctx.type || 'desconocido'}"). No se realiza ninguna operación en la BD.`);
        return;
      }
      console.log(`[Quiniela DB Save] Iniciando guardado de tipo "${ctx.type || 'completo'}" en URL: ${url}`, payload);
      $.ajax({
        url: url,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(payload),
        success: function(response) {
          if (response && response.status === 'success') {
            console.log(`[Quiniela DB Success] Guardado exitoso de tipo "${ctx.type || 'completo'}"`, response);
          } else {
            console.warn(`[Quiniela DB Warning] Fallo en el endpoint dedicado "${url}" para tipo "${ctx.type || 'completo'}". Respuesta:`, response);
            if (response && response.message) {
              showToast(response.message, "error");
            } else {
              showToast("Error al guardar cambios en la base de datos.", "error");
            }
          }
        },
        error: function(xhr, status, error) {
          console.warn(`[Quiniela DB Error] Error de red en el endpoint dedicado "${url}" para tipo "${ctx.type || 'completo'}". Detalles:`, error);
        }
      });
    } catch (e) {
      console.warn("[Quiniela DB Exception] Excepción en saveState:", e);
    }
  }

  // Actualizar los valores de puntos que aparecen en la pestaña de reglas
  function updateRulesPoints() {
    const ptsExact = parseInt(state.config.pointsExact || 3);
    const ptsWinner = parseInt(state.config.pointsWinner || 1);
    const ptsClosest = parseInt(state.config.pointsClosest || 1);
    const ptsChampion = parseInt(state.config.pointsChampion !== undefined ? state.config.pointsChampion : 10);

    $('.rules-pts-exact').text(ptsExact);
    $('.rules-pts-winner').text(ptsWinner);
    $('.rules-pts-closest').text(ptsClosest);
    $('.rules-pts-champion').text(ptsChampion);
    $('.rules-pts-total-exact').text(ptsExact + ptsWinner);
  }

  // ==========================================
  // SEGURIDAD DE ADMINISTRADOR: INTERFAZ Y MODALES
  // ==========================================

  // Actualizar UI según el rol (Administrador vs Usuario estándar)
  function updateAdminUI() {
    if (isAdminMode) {
      // Admin Activo
      $('#admin-login-toggle')
        .removeClass('btn-secondary')
        .addClass('btn-primary')
        .css('border-color', 'var(--primary)')
        .html('<i data-lucide="shield-check" style="color:#000;"></i> <span>Admin Activo</span>');
      
      // Mostrar inputs y secciones administrativas
      $('.admin-only-lock-warning').hide();
      $('#admin-pin-change-section').show();
      
      // Habilitar campos
      $('#pts-exact, #pts-winner, #pts-closest, #pts-champion, #btn-save-pts-config, #btn-toggle-champion-voting, #btn-sync-pre-incident-points').prop('disabled', false);
      $('#admin-select-champion, #btn-save-champion').prop('disabled', false);
      $('#btn-reset-players, #btn-reset-all').prop('disabled', false);
      
      // Habilitar controles de jugadores
      $('#new-player-name, #btn-add-player, #btn-delete-player').prop('disabled', false);

      // Quitar clase bloqueada si existía en botones de tab
      $('#nav-admin').find('i').removeClass('lucide-lock').addClass('lucide-settings');
    } else {
      // Modo Usuario / Cerrado
      $('#admin-login-toggle')
        .removeClass('btn-primary')
        .addClass('btn-secondary')
        .css('border-color', 'var(--border-color)')
        .html('<i data-lucide="lock"></i> <span>Acceso Admin</span>');
      
      // Mostrar advertencias de bloqueo
      $('.admin-only-lock-warning').show();
      $('#admin-pin-change-section').hide();
      
      // Deshabilitar campos
      $('#pts-exact, #pts-winner, #pts-closest, #pts-champion, #btn-save-pts-config, #btn-toggle-champion-voting, #btn-sync-pre-incident-points').prop('disabled', true);
      $('#admin-select-champion, #btn-save-champion').prop('disabled', true);
      $('#btn-reset-players, #btn-reset-all').prop('disabled', true);
      
      // Deshabilitar controles de jugadores
      $('#new-player-name, #btn-add-player, #btn-delete-player').prop('disabled', true);

      // Cambiar icono en los botones de navegación de pestañas
      $('#nav-admin').find('i').removeClass('lucide-settings').addClass('lucide-lock');
    }
    
    // Bloqueo de Configuración de Base de Datos
    if (dbConnected) {
      if (isAdminMode) {
        $('.db-lock-warning').hide();
        $('#db-config-host, #db-config-name, #db-config-user, #db-config-pass, #btn-save-db-config').prop('disabled', false);
      } else {
        $('.db-lock-warning').show();
        $('#db-config-host, #db-config-name, #db-config-user, #db-config-pass, #btn-save-db-config').prop('disabled', true);
      }
    } else {
      // Si la BD no está conectada, permitir edición para facilitar la configuración inicial
      $('.db-lock-warning').hide();
      $('#db-config-host, #db-config-name, #db-config-user, #db-config-pass, #btn-save-db-config').prop('disabled', false);
    }
    
    // Rerenderizar grillas si existen elementos para mantener en sincronía los campos de ingreso
    if (activePlayerId) {
      renderPredictionsGrid();
    }
    renderAdminGrid();
    
    // Rerenderizar la lista de puntos de ajuste si estamos en ajustes
    if (window.location.pathname.toLowerCase().indexOf('ajustes') !== -1) {
      renderBonusPointsList();
    }

    lucide.createIcons();
  }

  // Abrir modal de Login
  function openAdminModal(successCb, cancelCb) {
    adminLoginSuccessCallback = successCb || null;
    adminLoginCancelCallback = cancelCb || null;

    $('#admin-pin-input').val('');
    $('#admin-login-error').hide();
    $('#admin-modal').css('display', 'flex');
    setTimeout(() => {
      $('#admin-modal-card').css('transform', 'translateY(0)');
      $('#admin-pin-input').focus();
    }, 50);
  }

  // Cerrar modal de Login
  function closeAdminModal(isSuccess = false) {
    $('#admin-modal-card').css('transform', 'translateY(-20px)');
    setTimeout(() => {
      $('#admin-modal').fadeOut(150);
    }, 150);

    if (!isSuccess && typeof adminLoginCancelCallback === 'function') {
      const cb = adminLoginCancelCallback;
      adminLoginCancelCallback = null;
      adminLoginSuccessCallback = null;
      cb();
    } else {
      adminLoginCancelCallback = null;
    }
  }

  // Abrir modal de Detalle de Pronosticadores
  function openPredictionPlayersModal(matchId) {
    const match = WORLD_CUP_2026_MATCHES.find(m => m.id === matchId);
    if (!match) return;

    const resolvedTeam1 = getTeamName(match.id, 1, match.team1);
    const resolvedTeam2 = getTeamName(match.id, 2, match.team2);

    const times = getFormattedMatchTimes(match.time);
    $('#pred-modal-teams').text(`${resolvedTeam1} vs ${resolvedTeam2}`);
    $('#pred-modal-meta').html(`
      ${match.round} ${match.group ? `• ${match.group}` : ''} | ${match.date}<br>
      <span style="font-weight: 500;">Original: ${times.original}</span> &bull; 
      <span style="color: var(--primary); font-weight: 600;">SV (UTC-6): ${times.sv}</span> &bull; 
      <span style="color: var(--secondary); font-weight: 600;">CA (UTC-7): ${times.ca}</span>
    `);

    const predicted = [];
    const missing = [];

    state.players.forEach(p => {
      const pred = p.predictions[match.id];
      if (pred && pred.goals1 !== null && pred.goals1 !== "" && pred.goals2 !== null && pred.goals2 !== "") {
        predicted.push(p.name);
      } else {
        missing.push(p.name);
      }
    });

    const listsContainer = $('#pred-modal-lists');
    listsContainer.empty();

    if (state.players.length === 0) {
      listsContainer.html('<p style="text-align: center; color: var(--text-secondary); font-size: 0.9rem; padding: 2rem 0;">No hay jugadores registrados en la quiniela.</p>');
    } else {
      let html = '';

      // Lista 1: Ya Pronosticaron
      html += `
        <div style="margin-bottom: 1.5rem;">
          <h4 style="font-size: 0.85rem; font-weight: 600; color: var(--primary); margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem;">
            <i data-lucide="check-circle" style="width: 14px; height: 14px; color: var(--primary);"></i> Ya Pronosticaron (${predicted.length})
          </h4>
      `;
      if (predicted.length === 0) {
        html += `<p style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; padding-left: 1.2rem;">Ninguno de los jugadores ha pronosticado este partido.</p>`;
      } else {
        html += `<div style="display: flex; flex-wrap: wrap; gap: 0.5rem; padding-left: 1.2rem;">`;
        predicted.forEach(name => {
          html += `<span style="padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.8rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: var(--primary); font-weight: 500;">${name}</span>`;
        });
        html += `</div>`;
      }
      html += `</div>`;

      // Lista 2: Pendientes
      html += `
        <div>
          <h4 style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem;">
            <i data-lucide="help-circle" style="width: 14px; height: 14px; color: var(--text-secondary);"></i> Pendientes por Pronosticar (${missing.length})
          </h4>
      `;
      if (missing.length === 0) {
        html += `<p style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; padding-left: 1.2rem;">Todos los jugadores ya pronosticaron este partido.</p>`;
      } else {
        html += `<div style="display: flex; flex-wrap: wrap; gap: 0.5rem; padding-left: 1.2rem;">`;
        missing.forEach(name => {
          html += `<span style="padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.8rem; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); color: var(--text-secondary); font-weight: 500;">${name}</span>`;
        });
        html += `</div>`;
      }
      html += `</div>`;

      listsContainer.html(html);
    }

    $('#pred-players-modal').css('display', 'flex');
    setTimeout(() => {
      $('#pred-players-modal-card').css('transform', 'translateY(0)');
    }, 50);

    lucide.createIcons();
  }

  // Cerrar modal de Detalle de Pronosticadores
  function closePredictionPlayersModal() {
    $('#pred-players-modal-card').css('transform', 'translateY(-20px)');
    setTimeout(() => {
      $('#pred-players-modal').fadeOut(150);
    }, 150);
  }

  // Procesar Intento de Login
  function attemptAdminLogin() {
    const enteredPin = $('#admin-pin-input').val();
    const correctPin = state.config.adminPin || '1234';

    if (enteredPin === correctPin) {
      // Login Correcto
      isAdminMode = true;
      sessionStorage.setItem('quiniela_isAdmin', 'true');
      closeAdminModal(true);
      updateAdminUI();
      
      showToast("Acceso Administrador concedido.");
      
      if (typeof adminLoginSuccessCallback === 'function') {
        const cb = adminLoginSuccessCallback;
        adminLoginSuccessCallback = null;
        cb();
      } else {
        const path = window.location.pathname;
        let page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
        if (page === '' || page === 'index.php') page = 'index.html';
        if (page !== 'admin.html' && page !== 'ajustes.html') {
          window.location.href = 'admin.html';
        }
      }
    } else {
      // Login Fallido: Vibrar modal y mostrar error
      $('#admin-login-error').fadeIn(150);
      const card = $('#admin-modal-card');
      card.addClass('shake');
      
      // Remover clase de vibración para poder dispararla de nuevo
      setTimeout(() => {
        card.removeClass('shake');
      }, 400);

      $('#admin-pin-input').focus().select();
    }
  }

  // Cambiar PIN
  $('#btn-save-admin-pin').on('click', function() {
    const newPin = $('#new-admin-pin').val().trim();
    if (newPin.length < 4) {
      showToast("El PIN debe tener al menos 4 dígitos.", "error");
      return;
    }

    state.config.adminPin = newPin;
    saveState({ type: 'config' });
    $('#new-admin-pin').val('');
    showToast("PIN de seguridad actualizado.");
  });

  // Eventos de interacción del Modal de login
  $('#admin-login-toggle').on('click', function() {
    if (isAdminMode) {
      if (confirm("¿Deseas cerrar la sesión de administrador? Volverás al modo de visualización normal.")) {
        isAdminMode = false;
        sessionStorage.removeItem('quiniela_isAdmin');
        updateAdminUI();
        
        const path = window.location.pathname;
        let page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
        if (page === '' || page === 'index.php') page = 'index.html';
        
        if (page === 'admin.html' || page === 'ajustes.html') {
          window.location.href = 'index.html';
        } else {
          if (page === 'pronosticos.html') {
            renderPlayersSelector();
            if (activePlayerId) renderPredictionsGrid();
          }
        }
        showToast("Sesión de Administrador cerrada.");
      }
    } else {
      openAdminModal();
    }
  });

  $('#btn-admin-cancel').on('click', closeAdminModal);
  $('#btn-admin-login').on('click', attemptAdminLogin);
  $('#admin-pin-input').on('keypress', function(e) {
    if (e.which === 13) attemptAdminLogin();
  });

  // Clic fuera del modal para cerrar
  $('#admin-modal').on('click', function(e) {
    if (e.target === this) closeAdminModal();
  });

  // ==========================================
  // 2. CÁLCULO DE PUNTOS (INCLUYE REGLA DE CERCANÍA RELATIVA)
  // ==========================================

  // Calcular puntos de un jugador para un partido específico
  function getPlayerPointsForMatch(playerId, matchId) {
    const player = state.players.find(p => p.id == playerId);
    if (!player) return { points: 0, type: 'none' };
    
    const pred = player.predictions[matchId];
    if (!pred || pred.goals1 === null || pred.goals1 === "" || pred.goals2 === null || pred.goals2 === "") {
      return { points: 0, type: 'none' };
    }
    
    const real = state.realResults[matchId];
    if (!real || real.status !== 'finished') {
      return { points: 0, type: 'none' };
    }
    
    const p1 = parseInt(pred.goals1);
    const p2 = parseInt(pred.goals2);
    const r1 = parseInt(real.goals1);
    const r2 = parseInt(real.goals2);
    
    if (isNaN(p1) || isNaN(p2) || isNaN(r1) || isNaN(r2)) {
      return { points: 0, type: 'none' };
    }

    if (p1 === r1 && p2 === r2) {
      const ptsExact = parseInt(state.config.pointsExact || 3);
      const ptsWinner = parseInt(state.config.pointsWinner || 1);
      return { points: ptsExact + ptsWinner, type: 'exact' };
    }
    
    let minDistance = Infinity;
    state.players.forEach(otherPlayer => {
      const otherPred = otherPlayer.predictions[matchId];
      if (otherPred && otherPred.goals1 !== null && otherPred.goals1 !== "" && otherPred.goals2 !== null && otherPred.goals2 !== "") {
        const op1 = parseInt(otherPred.goals1);
        const op2 = parseInt(otherPred.goals2);
        
        const otherIsExact = (op1 === r1 && op2 === r2);
        if (!otherIsExact) {
          const odist = Math.abs(op1 - r1) + Math.abs(op2 - r2);
          if (odist < minDistance) {
            minDistance = odist;
          }
        }
      }
    });
    
    const distance = Math.abs(p1 - r1) + Math.abs(p2 - r2);
    let pointsEarned = 0;
    let type = 'fail';
    
    const predDiff = p1 - p2;
    const realDiff = r1 - r2;
    const isWinner = (predDiff > 0 && realDiff > 0) || (predDiff < 0 && realDiff < 0) || (predDiff === 0 && realDiff === 0);
    
    if (isWinner) {
      pointsEarned += parseInt(state.config.pointsWinner || 1);
      type = 'winner';
    }
    
    if (minDistance !== Infinity && distance === minDistance) {
      pointsEarned += parseInt(state.config.pointsClosest || 1);
      type = type === 'winner' ? 'winner_closest' : 'closest';
    }
    
    return { points: pointsEarned, type };
  }

  function getPlayersLeaderboard() {
    return state.players.map(player => {
      let totalPoints = player.bonusPoints !== undefined ? parseInt(player.bonusPoints) : 0;
      let exactHits = 0;
      let closestHits = 0;
      let winnerHits = 0;
      let incorrects = 0;
      let predictedCount = 0;

      if (typeof WORLD_CUP_2026_MATCHES !== 'undefined') {
        WORLD_CUP_2026_MATCHES.forEach(match => {
          const pred = player.predictions[match.id];
          const hasPred = pred && pred.goals1 !== null && pred.goals1 !== undefined && pred.goals1 !== "" &&
                                 pred.goals2 !== null && pred.goals2 !== undefined && pred.goals2 !== "";
          
          if (hasPred) {
            predictedCount++;
          }

          const real = state.realResults[match.id];
          if (real && real.status === 'finished') {
            const result = getPlayerPointsForMatch(player.id, match.id);
            totalPoints += result.points;
            
            if (result.type === 'exact') {
              exactHits++;
              winnerHits++;
            } else if (result.type === 'winner') {
              winnerHits++;
            } else if (result.type === 'closest') {
              closestHits++;
            } else if (result.type === 'winner_closest') {
              winnerHits++;
              closestHits++;
            } else if (result.type === 'fail') {
              incorrects++;
            } else if (result.type === 'none') {
              incorrects++;
            }
          }
        });
      }

      // Sumar puntos de la predicción del campeón
      const points = state.config.pointsChampion !== undefined ? state.config.pointsChampion : 10;
      let championPredictionText = 'Sin predicción';
      if (player.championPrediction) {
        if (state.realChampion) {
          if (player.championPrediction === state.realChampion) {
            totalPoints += points;
            championPredictionText = `${player.championPrediction} (+${points} pts)`;
          } else {
            championPredictionText = `${player.championPrediction} (Fallo - 0 pts)`;
          }
        } else {
          championPredictionText = player.championPrediction;
        }
      }

      return {
        id: player.id,
        name: player.name,
        totalPoints,
        bonusPoints: player.bonusPoints !== undefined ? parseInt(player.bonusPoints) : 0,
        exactHits,
        closestHits,
        winnerHits,
        incorrects,
        predictedCount,
        championPredictionText,
        championPrediction: player.championPrediction
      };
    }).sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      if (b.exactHits !== a.exactHits) {
        return b.exactHits - a.exactHits;
      }
      if (b.closestHits !== a.closestHits) {
        return b.closestHits - a.closestHits;
      }
      if (b.winnerHits !== a.winnerHits) {
        return b.winnerHits - a.winnerHits;
      }
      return a.name.localeCompare(b.name);
    });
  }

  // Obtener los MVPs de cada día (top 3) basado en partidos finalizados
  function getDailyMVPs() {
    if (typeof WORLD_CUP_2026_MATCHES === 'undefined' || !state.players || state.players.length === 0) {
      return [];
    }

    // 1. Agrupar partidos finalizados por fecha
    const finishedMatchesByDate = {};
    WORLD_CUP_2026_MATCHES.forEach(match => {
      const real = state.realResults[match.id];
      if (real && real.status === 'finished') {
        if (!finishedMatchesByDate[match.date]) {
          finishedMatchesByDate[match.date] = [];
        }
        finishedMatchesByDate[match.date].push(match);
      }
    });

    const dailyMVPs = [];

    // 2. Calcular los puntos por día de cada jugador
    Object.keys(finishedMatchesByDate).forEach(date => {
      const matches = finishedMatchesByDate[date];
      const playerPoints = [];

      state.players.forEach(player => {
        let totalDailyPoints = 0;
        matches.forEach(match => {
          const result = getPlayerPointsForMatch(player.id, match.id);
          totalDailyPoints += result.points;
        });
        
        // Solo incluir a jugadores con puntos > 0
        if (totalDailyPoints > 0) {
          playerPoints.push({
            id: player.id,
            name: player.name,
            points: totalDailyPoints
          });
        }
      });

      // Ordenar por puntos desc, luego nombre asc
      playerPoints.sort((a, b) => {
        if (b.points !== a.points) {
          return b.points - a.points;
        }
        return a.name.localeCompare(b.name);
      });

      // Tomar el top 3 de jugadores con puntos
      const topPlayers = playerPoints.slice(0, 3);

      dailyMVPs.push({
        date,
        topPlayers
      });
    });

    // Ordenar fechas de manera descendente (las más recientes primero)
    dailyMVPs.sort((a, b) => b.date.localeCompare(a.date));

    return dailyMVPs;
  }

  // Formatear fecha a español
  function formatDateSpanish(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const day = parseInt(parts[2], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    const year = parts[0];
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return `${day} de ${months[monthIdx]}, ${year}`;
  }

  // Obtener horarios en múltiples zonas (Original, El Salvador UTC-6, California UTC-7)
  function getFormattedMatchTimes(timeStr) {
    if (!timeStr) return { original: '', sv: '', ca: '' };
    
    const parts = timeStr.trim().split(' ');
    if (parts.length < 2) return { original: timeStr, sv: timeStr, ca: timeStr };
    
    const timeVal = parts[0]; // e.g. "13:00" o "20:30"
    const utcPart = parts[1]; // e.g. "UTC-6" o "UTC-4"
    
    const timeMatch = timeVal.match(/^(\d{1,2}):(\d{2})$/);
    const utcMatch = utcPart.match(/^UTC([+-]\d+)$/);
    
    if (!timeMatch || !utcMatch) {
      return { original: timeStr, sv: timeStr, ca: timeStr };
    }
    
    const hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2];
    const origOffset = parseInt(utcMatch[1], 10);
    
    // El Salvador: siempre UTC-6
    const svOffset = -6;
    const svHours = (hours + (svOffset - origOffset) + 24) % 24;
    const svTime = `${String(svHours).padStart(2, '0')}:${minutes}`;
    
    // California: UTC-7 (PDT en Junio/Julio 2026)
    const caOffset = -7;
    const caHours = (hours + (caOffset - origOffset) + 24) % 24;
    const caTime = `${String(caHours).padStart(2, '0')}:${minutes}`;
    
    return {
      original: timeStr,
      sv: svTime,
      ca: caTime
    };
  }

  // Obtener la fecha de inicio real de un partido como objeto Date
  function getMatchStartDate(match) {
    if (!match || !match.date || !match.time) return null;
    
    const timeMatch = match.time.trim().match(/^(\d{1,2}):(\d{2})\s+UTC([+-]\d+)$/);
    if (!timeMatch) return null;
    
    const hh = timeMatch[1].padStart(2, '0');
    const mm = timeMatch[2];
    const offsetVal = parseInt(timeMatch[3], 10);
    
    const sign = offsetVal >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetVal);
    const offsetStr = `${sign}${String(absOffset).padStart(2, '0')}:00`;
    
    const isoStr = `${match.date}T${hh}:${mm}:00${offsetStr}`;
    return new Date(isoStr);
  }

  // ==========================================
  // 3. COMPONENTES RENDERIZADOS
  // ==========================================

  // Renderizar Dashboard
  function renderDashboard() {
    const leaderboard = getPlayersLeaderboard();
    const totalPlayers = state.players.length;
    
    let finishedMatches = 0;
    Object.values(state.realResults).forEach(match => {
      if (match.status === 'finished') finishedMatches++;
    });

    let totalPreds = 0;
    state.players.forEach(p => {
      Object.values(p.predictions).forEach(pred => {
        if (pred.goals1 !== null && pred.goals1 !== undefined && pred.goals1 !== "" &&
            pred.goals2 !== null && pred.goals2 !== undefined && pred.goals2 !== "") {
          totalPreds++;
        }
      });
    });

    $('#stat-players').text(totalPlayers);
    $('#stat-matches').text(`${finishedMatches} / 104`);
    $('#stat-predictions').text(totalPreds);

    const podiumContainer = $('#podium-container');
    podiumContainer.empty();

    if (leaderboard.length === 0) {
      podiumContainer.append(`
        <div style="text-align: center; color: var(--text-secondary); width: 100%;">
          <i data-lucide="award" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 0.8rem;"></i>
          <p>Registra jugadores e ingresa resultados reales para ver el podio.</p>
        </div>
      `);
      lucide.createIcons();
      return;
    }

    const top3 = [];
    if (leaderboard[1]) top3.push({ pos: 2, player: leaderboard[1], color: '#94a3b8', height: '140px', label: '2°' });
    top3.push({ pos: 1, player: leaderboard[0], color: '#fbbf24', height: '180px', label: '1°' });
    if (leaderboard[2]) top3.push({ pos: 3, player: leaderboard[2], color: '#ea580c', height: '110px', label: '3°' });

    const renderOrder = [];
    if (top3.find(x => x.pos === 2)) renderOrder.push(top3.find(x => x.pos === 2));
    renderOrder.push(top3.find(x => x.pos === 1));
    if (top3.find(x => x.pos === 3)) renderOrder.push(top3.find(x => x.pos === 3));

    renderOrder.forEach(item => {
      podiumContainer.append(`
        <div style="display: flex; flex-direction: column; align-items: center; width: 150px; text-align: center;">
          <div style="font-size: 1.1rem; font-weight: 700; font-family: 'Outfit'; color: var(--text-primary); margin-bottom: 0.4rem;">
            ${item.player.name}
          </div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600; margin-bottom: 0.8rem;">
            ${item.player.totalPoints} Pts
          </div>
          <div style="
            background: linear-gradient(185deg, ${item.color}ee, ${item.color}55);
            width: 80px;
            height: ${item.height};
            border-radius: var(--border-radius-md) var(--border-radius-md) 0 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Outfit', sans-serif;
            font-size: 2.5rem;
            font-weight: 800;
            color: #0b0f19;
            box-shadow: var(--shadow-md);
            border: 2px solid ${item.color};
            border-bottom: none;
            position: relative;
          ">
            ${item.label}
          </div>
        </div>
      `);
    });

    // Renderizar Sótano (Tarjetas Rojas)
    const redCardsContainer = $('#red-cards-container');
    redCardsContainer.empty();

    if (leaderboard.length < 2) {
      redCardsContainer.append(`
        <div style="text-align: center; color: var(--text-secondary); width: 100%; padding: 1.5rem 0;">
          <i data-lucide="info" style="width: 32px; height: 32px; color: var(--text-muted); margin-bottom: 0.5rem; display: block; margin-left: auto; margin-right: auto;"></i>
          <p style="font-size: 0.9rem;">Se necesitan al menos 2 jugadores para activar el Sótano de Posiciones.</p>
        </div>
      `);
    } else {
      const bottomPlayers = [...leaderboard]
        .slice(-3)
        .reverse()
        .filter(p => {
          const index = leaderboard.findIndex(x => x.id === p.id);
          return index > 0; // Excluir el primer lugar
        });

      bottomPlayers.forEach(player => {
        const rank = leaderboard.findIndex(p => p.id === player.id) + 1;
        redCardsContainer.append(`
          <div style="
            background: rgba(244, 63, 94, 0.04);
            border: 1px solid rgba(244, 63, 94, 0.18);
            border-radius: var(--border-radius-md);
            padding: 1.5rem 1rem;
            text-align: center;
            position: relative;
            flex: 1 1 200px;
            max-width: 250px;
            box-shadow: 0 4px 12px rgba(244, 63, 94, 0.05);
            backdrop-filter: var(--glass-blur);
            transition: transform var(--transition-fast);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.4rem;
          " onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
            <!-- Etiqueta de Tarjeta Roja -->
            <span style="
              position: absolute;
              top: -10px;
              background: var(--danger);
              color: #ffffff;
              font-size: 0.7rem;
              font-weight: 700;
              padding: 0.2rem 0.6rem;
              border-radius: var(--border-radius-sm);
              box-shadow: 0 2px 6px rgba(244, 63, 94, 0.3);
              text-transform: uppercase;
              letter-spacing: 0.5px;
            ">
              Tarjeta Roja 🟥
            </span>

            <div style="font-size: 1.15rem; font-weight: 700; font-family: 'Outfit'; color: var(--text-primary); margin-top: 0.4rem;">
              ${player.name}
            </div>
            
            <div style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600;">
              Puesto: ${rank}° de ${totalPlayers}
            </div>

            <div style="
              font-size: 1.3rem;
              color: var(--danger);
              font-weight: 800;
              font-family: 'Outfit', sans-serif;
              margin-top: 0.2rem;
            ">
              ${player.totalPoints} Pts
            </div>
          </div>
        `);
      });
    }

    // Renderizar MVP del Día (Top 3)
    const mvpContainer = $('#mvp-container');
    if (mvpContainer.length > 0) {
      mvpContainer.empty();
      const dailyMVPs = getDailyMVPs();

      if (dailyMVPs.length === 0) {
        mvpContainer.append(`
          <div style="text-align: center; color: var(--text-secondary); width: 100%; padding: 1.5rem 0;">
            <i data-lucide="info" style="width: 32px; height: 32px; color: var(--text-muted); margin-bottom: 0.5rem; display: block; margin-left: auto; margin-right: auto;"></i>
            <p style="font-size: 0.9rem;">Los MVPs de cada día aparecerán aquí conforme finalicen los partidos.</p>
          </div>
        `);
      } else {
        dailyMVPs.forEach(dayData => {
          if (dayData.topPlayers.length > 0) {
            let top3Html = '';
            let currentRank = 1;
            let prevPoints = -1;

            dayData.topPlayers.forEach((p, idx) => {
              if (idx > 0 && p.points < prevPoints) {
                currentRank = idx + 1;
              }
              prevPoints = p.points;

              // Definir colores premium para los badges del podio
              let badgeColor = 'var(--text-secondary)';
              let badgeBg = 'rgba(255, 255, 255, 0.08)';
              if (currentRank === 1) {
                badgeColor = '#0b0f19';
                badgeBg = 'var(--primary)'; // Oro / Amarillo
              } else if (currentRank === 2) {
                badgeColor = '#0b0f19';
                badgeBg = '#94a3b8'; // Plata
              } else if (currentRank === 3) {
                badgeColor = '#0b0f19';
                badgeBg = '#ea580c'; // Bronce
              }

              top3Html += `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.2rem 0;">
                  <div style="display: flex; align-items: center; gap: 0.4rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 75%;">
                    <span style="
                      display: inline-flex;
                      align-items: center;
                      justify-content: center;
                      width: 20px;
                      height: 20px;
                      border-radius: 50%;
                      background: ${badgeBg};
                      color: ${badgeColor};
                      font-size: 0.7rem;
                      font-weight: 800;
                      flex-shrink: 0;
                    ">${currentRank}°</span>
                    <span style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</span>
                  </div>
                  <span style="font-size: 0.85rem; font-weight: 700; color: var(--primary); flex-shrink: 0;">+${p.points} Pts</span>
                </div>
              `;
            });

            mvpContainer.append(`
              <div class="mvp-day-card" style="
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: var(--border-radius-md);
                padding: 1rem;
                flex: 1 1 calc(25% - 1rem);
                min-width: 220px;
                max-width: 280px;
                display: flex;
                flex-direction: column;
                gap: 0.4rem;
                box-shadow: var(--shadow-sm);
                backdrop-filter: var(--glass-blur);
                transition: transform var(--transition-fast), border-color var(--transition-fast);
              " onmouseover="this.style.transform='translateY(-2px)'; this.style.borderColor='rgba(251, 191, 36, 0.3)'" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='rgba(255, 255, 255, 0.08)'">
                <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 600; display: flex; align-items: center; gap: 0.25rem; margin-bottom: 0.3rem;">
                  <i data-lucide="calendar" style="width: 12px; height: 12px; color: var(--primary);"></i>
                  ${formatDateSpanish(dayData.date)}
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.3rem;">
                  ${top3Html}
                </div>
              </div>
            `);
          } else {
            mvpContainer.append(`
              <div class="mvp-day-card" style="
                background: rgba(255, 255, 255, 0.015);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: var(--border-radius-md);
                padding: 1rem;
                flex: 1 1 calc(25% - 1rem);
                min-width: 220px;
                max-width: 280px;
                display: flex;
                flex-direction: column;
                gap: 0.3rem;
                box-shadow: var(--shadow-sm);
                backdrop-filter: var(--glass-blur);
                opacity: 0.75;
              ">
                <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; display: flex; align-items: center; gap: 0.25rem; margin-bottom: 0.3rem;">
                  <i data-lucide="calendar" style="width: 12px; height: 12px;"></i>
                  ${formatDateSpanish(dayData.date)}
                </div>
                <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-muted); font-family: 'Outfit';">
                  Ninguno con puntos
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; display: flex; align-items: center; gap: 0.25rem; margin-top: auto; padding-top: 0.3rem;">
                  <i data-lucide="minus" style="width: 14px; height: 14px;"></i>
                  0 Pts
                </div>
              </div>
            `);
          }
        });
      }
    }

    lucide.createIcons();
  }

  // Renderizar Tabla de Posiciones
  function renderLeaderboard() {
    const leaderboard = getPlayersLeaderboard();
    const tbody = $('#leaderboard-body');
    tbody.empty();

    if (leaderboard.length === 0) {
      tbody.append(`
        <tr>
          <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 3rem;">
            No hay jugadores agregados. Ve a la pestaña "Pronósticos" para agregar tu primer jugador.
          </td>
        </tr>
      `);
      return;
    }

    leaderboard.forEach((player, index) => {
      const pos = index + 1;
      let posClass = 'pos-other';
      if (pos === 1) posClass = 'pos-1';
      else if (pos === 2) posClass = 'pos-2';
      else if (pos === 3) posClass = 'pos-3';

      const rowId = `row-player-${player.id}`;
      const detailId = `detail-player-${player.id}`;

      const flagHTML = player.championPrediction ? getTeamFlagHTML(player.championPrediction) : '';

      tbody.append(`
        <tr class="player-row" id="${rowId}" data-player-id="${player.id}">
          <td><span class="position-badge ${posClass}">${pos}</span></td>
          <td style="font-weight: 600; font-family: 'Outfit';">${player.name}</td>
          <td style="text-align: center;">${player.predictedCount} / 104</td>
          <td style="text-align: center; color: var(--primary); font-weight: 600;">${player.exactHits}</td>
          <td style="text-align: center; color: var(--info); font-weight: 600;">${player.closestHits}</td>
          <td style="text-align: center; color: var(--secondary); font-weight: 600;">${player.winnerHits}</td>
          <td style="text-align: center; color: var(--text-muted); font-weight: 600;">${player.incorrects}</td>
          <td style="text-align: center; font-size: 0.85rem; vertical-align: middle;">
            <div style="display: inline-flex; align-items: center; gap: 0.4rem; justify-content: center;">
              ${flagHTML}
              <span style="font-weight: 500;">${player.championPredictionText || 'Sin predicción'}</span>
            </div>
          </td>
          <td style="text-align: right; font-weight: 700; font-size: 1.1rem; color: var(--primary);">${player.totalPoints}</td>
        </tr>
        <tr class="player-details-row" id="${detailId}" style="display: none;">
          <td colspan="9" style="padding: 0;">
            <div class="details-wrapper" id="details-wrapper-${player.id}" style="display: none; overflow: hidden;">
              <div class="details-container" id="details-container-${player.id}">
                <!-- Llenado al abrir para optimizar performance -->
              </div>
            </div>
          </td>
        </tr>
      `);
    });

    $('.player-row').off('click').on('click', function() {
      const playerId = $(this).data('player-id');
      const detailRow = $(`#detail-player-${playerId}`);
      const wrapper = detailRow.find('.details-wrapper');
      
      if (detailRow.is(':visible')) {
        wrapper.slideUp(150, function() {
          detailRow.hide();
        });
      } else {
        // Collapse all other detail rows and their wrappers
        $('.player-details-row').hide();
        $('.details-wrapper').hide();
        
        renderPlayerDetails(playerId);
        
        detailRow.css('display', 'table-row');
        wrapper.slideDown(200);
      }
    });
  }

  // Renderizar detalles de un jugador expandido en la clasificación
  function renderPlayerDetails(playerId) {
    const player = state.players.find(p => p.id == playerId);
    const container = $(`#details-container-${playerId}`);
    container.empty();

    if (!player) return;

    if (typeof WORLD_CUP_2026_MATCHES === 'undefined' || WORLD_CUP_2026_MATCHES.length === 0) {
      container.append('<p style="padding: 1rem; color: var(--text-muted);">No hay partidos cargados.</p>');
      return;
    }

    // Group relevant matches by date
    const matchesByDate = {};
    WORLD_CUP_2026_MATCHES.forEach(match => {
      const pred = player.predictions[match.id];
      const real = state.realResults[match.id];
      
      const hasPred = pred && pred.goals1 !== null && pred.goals1 !== undefined && pred.goals1 !== "";
      const isFinished = real && real.status === 'finished';

      if (!hasPred && !isFinished) return;

      if (!matchesByDate[match.date]) {
        matchesByDate[match.date] = [];
      }
      matchesByDate[match.date].push({ match, pred, real, hasPred, isFinished });
    });

    // Get sorted dates (descending - most recent first)
    const sortedDates = Object.keys(matchesByDate).sort((a, b) => b.localeCompare(a));

    if (sortedDates.length === 0) {
      container.append('<p style="text-align: center; color: var(--text-muted); padding: 1.5rem; width: 100%;">Este jugador no ha registrado pronósticos ni hay partidos jugados.</p>');
      return;
    }

    // Loop through each date
    sortedDates.forEach(date => {
      // Append date header
      const formattedDate = formatDateSpanish(date) || date;
      container.append(`
        <div class="details-day-header">
          <i data-lucide="calendar" style="width: 14px; height: 14px; color: var(--primary);"></i>
          <span>${formattedDate}</span>
        </div>
      `);

      // Append grid for this day's matches
      const dayGridId = `day-grid-${playerId}-${date}`;
      container.append(`
        <div class="details-day-grid" id="${dayGridId}"></div>
      `);

      const dayGrid = $(`#${dayGridId}`);

      // Render matches in this day's grid
      matchesByDate[date].forEach(({ match, pred, real, hasPred, isFinished }) => {
        let predText = "Sin Pronóstico";
        if (hasPred) {
          predText = `${pred.goals1} - ${pred.goals2}`;
        }

        let realText = "Pendiente";
        if (isFinished) {
          realText = `${real.goals1} - ${real.goals2}`;
        }

        let ptsTagHTML = '';
        let scoreClass = 'points-none';

        if (isFinished) {
          if (hasPred) {
            const result = getPlayerPointsForMatch(player.id, match.id);
            if (result.type === 'exact') {
              scoreClass = 'points-exact';
              ptsTagHTML = `<span class="mini-pred-pts-tag" style="background-color: var(--primary-glow); color: var(--primary);">+${result.points} pts (Exacto)</span>`;
            } else if (result.type === 'winner_closest') {
              scoreClass = 'points-winner';
              ptsTagHTML = `<span class="mini-pred-pts-tag" style="background-color: var(--secondary-glow); color: var(--secondary); border: 1.2px solid var(--info);">+${result.points} pts (Ganador + Cercano)</span>`;
            } else if (result.type === 'winner') {
              scoreClass = 'points-winner';
              ptsTagHTML = `<span class="mini-pred-pts-tag" style="background-color: var(--secondary-glow); color: var(--secondary);">+${result.points} pts (Ganador)</span>`;
            } else if (result.type === 'closest') {
              scoreClass = 'points-winner';
              ptsTagHTML = `<span class="mini-pred-pts-tag" style="background-color: var(--accent-glow); color: var(--info);">+${result.points} pts (Cercano)</span>`;
            } else {
              scoreClass = 'points-none';
              ptsTagHTML = `<span class="mini-pred-pts-tag" style="background-color: var(--danger-glow); color: var(--danger);">0 pts</span>`;
            }
          } else {
            scoreClass = 'points-none';
            ptsTagHTML = `<span class="mini-pred-pts-tag" style="background-color: var(--danger-glow); color: var(--danger);">0 pts (Sin Pronóstico)</span>`;
          }
        }

        const resolvedTeam1 = getTeamName(match.id, 1, match.team1);
        const resolvedTeam2 = getTeamName(match.id, 2, match.team2);
        const flag1HTML = getTeamFlagHTML(resolvedTeam1);
        const flag2HTML = getTeamFlagHTML(resolvedTeam2);

        dayGrid.append(`
          <div class="mini-prediction-card">
            <div class="mini-pred-header">
              <span>${match.round} ${match.group ? `• ${match.group}` : ''}</span>
              <span>ID: ${match.id}</span>
            </div>
            <div class="mini-pred-teams" style="gap:0.4rem;">
              <span style="display:flex; align-items:center; gap:0.4rem; overflow:hidden; text-overflow:ellipsis;" title="${resolvedTeam1} vs ${resolvedTeam2}">
                ${flag1HTML} <span style="font-size:0.78rem;">vs</span> ${flag2HTML}
              </span>
              <span class="mini-pred-score ${scoreClass}">${predText}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.3rem; font-size: 0.75rem; color: var(--text-muted);">
              <span>Real: ${realText}</span>
              ${ptsTagHTML}
            </div>
          </div>
        `);
      });
    });

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  // Renderizar Lista de Puntos de Ajuste (Bonus) en Ajustes
  function renderBonusPointsList() {
    const container = $('#bonus-players-list');
    if (!container.length) return;
    
    container.empty();
    
    if (!state.players || state.players.length === 0) {
      container.html('<p style="color: var(--text-muted); font-size: 0.9rem; text-align: center;">No hay jugadores registrados.</p>');
      return;
    }
    
    state.players.forEach(p => {
      const bonus = p.bonusPoints !== undefined ? p.bonusPoints : 0;
      const html = `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 1rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: var(--border-radius-sm);">
          <span style="font-weight: 500;">${p.name}</span>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="number" class="player-bonus-input input-text" data-player-id="${p.id}" value="${bonus}" style="width: 80px; text-align: center; padding: 0.3rem 0.5rem; font-size: 0.9rem;" ${isAdminMode ? '' : 'disabled'}>
            <span style="font-size: 0.8rem; color: var(--text-secondary);">pts extra</span>
          </div>
        </div>
      `;
      container.append(html);
    });
    
    // Configurar event listener
    $('.player-bonus-input').off('change').on('change', function() {
      if (!isAdminMode) return;
      const pId = $(this).data('player-id');
      const val = parseInt($(this).val()) || 0;
      
      // Actualizar en memoria
      const player = state.players.find(pl => pl.id == pId);
      if (player) {
        player.bonusPoints = val;
      }
      
      // Guardar en la base de datos
      $.ajax({
        url: 'api.php?action=save_bonus_points',
        type: 'POST',
        data: JSON.stringify({ player_id: pId, bonus_points: val }),
        contentType: 'application/json',
        dataType: 'json',
        success: function(res) {
          try {
            const parsed = typeof res === 'string' ? JSON.parse(res) : res;
            if (parsed && parsed.status === 'success') {
              showToast("Puntos de ajuste actualizados.", "success");
              renderLeaderboard();
              renderDashboard();
            } else {
              showToast("Error al guardar puntos de ajuste.", "error");
            }
          } catch(e) {
            console.error("Error parsing response:", e);
            showToast("Error al procesar la respuesta del servidor.", "error");
          }
        },
        error: function() {
          showToast("Error de conexión al guardar puntos.", "error");
        }
      });
    });
  }

  // Auto-ajustar puntos para que coincidan exactamente con la tabla previa al incidente
  function autoAdjustPreIncidentPoints() {
    const targetPointsMap = {
      '1781052620631': 34, // Carlos Cardoza
      '1781053224616': 33, // Jorge Varela
      '1781051130474': 27, // Brian Ventura
      '1781052553597': 26, // Karla Reyes
      '1781051937433': 26, // Sussy Escobar
      '1781052648683': 22, // Walter Campos
      '1781051800815': 22, // Eduardo Mata
      '1781052521483': 19, // Elsa Milla
      '1781052534647': 18, // Mario Estrada
      '1781052568919': 16, // Hector Garcia
      '1781052600345': 11, // JC Andreu
      '1781052640891': 4   // Raquel Mejia
    };

    // Mapa de nombres para fallback en caso de que los IDs del usuario difieran de los originales
    const targetNamesMap = {
      'carlos cardoza': 34,
      'jorge varela': 33,
      'brian ventura': 27,
      'karla reyes': 26,
      'sussy escobar': 26,
      'walter campos': 22,
      'eduardo mata': 22,
      'elsa milla': 19,
      'mario estrada': 18,
      'hector garcia': 16,
      'jc andreu': 11,
      'raquel mejia': 4
    };

    // Guardar bonusPoints actuales para restauración en memoria temporal
    const savedBonus = state.players.map(p => ({ id: p.id, bonus: p.bonusPoints || 0 }));
    
    // Poner todos a 0 para el cálculo de puntos de predicción puros
    state.players.forEach(p => p.bonusPoints = 0);
    
    // Calcular puntos base a partir de pronósticos y resultados reales procesados en el sistema
    const baseLeaderboard = getPlayersLeaderboard();
    
    // Restaurar los bonus en memoria
    state.players.forEach(p => {
      const saved = savedBonus.find(s => s.id === p.id);
      p.bonusPoints = saved ? saved.bonus : 0;
    });
    
    // Ejecutar el guardado secuencial sincrónico de las diferencias calculadas
    let successCount = 0;
    let completedCount = 0;
    const totalCount = baseLeaderboard.length;
    
    if (totalCount === 0) {
      showToast("No hay jugadores registrados para realizar el ajuste.", "error");
      return;
    }

    baseLeaderboard.forEach(item => {
      const pId = item.id;
      let target = targetPointsMap[pId];
      
      // Fallback por nombre si el ID no se encuentra en el mapa
      if (target === undefined && item.name) {
        const normalizedName = item.name.trim().toLowerCase();
        target = targetNamesMap[normalizedName];
      }

      if (target !== undefined) {
        const base = item.totalPoints; // Puntos calculados de predicciones
        const diff = target - base;
        
        // Guardar en memoria
        const player = state.players.find(pl => pl.id == pId);
        if (player) {
          player.bonusPoints = diff;
        }
        
        // Enviar al servidor mediante AJAX
        $.ajax({
          url: 'api.php?action=save_bonus_points',
          type: 'POST',
          data: JSON.stringify({ player_id: pId, bonus_points: diff }),
          contentType: 'application/json',
          dataType: 'json',
          success: function(res) {
            successCount++;
            completedCount++;
            if (completedCount === totalCount) {
              finishSync();
            }
          },
          error: function() {
            completedCount++;
            if (completedCount === totalCount) {
              finishSync();
            }
          }
        });
      } else {
        completedCount++;
        if (completedCount === totalCount) {
          finishSync();
        }
      }
    });

    function finishSync() {
      showToast(`Ajuste completado: ${successCount} jugadores sincronizados con éxito.`, "success");
      renderBonusPointsList();
      renderLeaderboard();
      renderDashboard();
    }
  }

  // Renderizar Selector de Jugadores en Pronósticos
  function renderPlayersSelector() {
    const select = $('#player-select-dropdown');
    select.empty();

    if (state.players.length === 0) {
      $('#no-players-placeholder').show();
      $('#predictions-content-area').hide();
      return;
    }

    $('#no-players-placeholder').hide();
    $('#predictions-content-area').show();

    const leaderboard = getPlayersLeaderboard();

    // Agregar primera opción: "Ingrese usuario"
    const isNoActivePlayer = activePlayerId === null || !state.players.some(p => p.id == activePlayerId);
    const firstOptionSelectedAttr = isNoActivePlayer ? 'selected' : '';
    select.append(`<option value="" ${firstOptionSelectedAttr}>Ingrese usuario</option>`);

    state.players.forEach(player => {
      const leaderInfo = leaderboard.find(l => l.id === player.id) || { totalPoints: 0 };
      const selectedAttr = player.id == activePlayerId ? 'selected' : '';
      select.append(`<option value="${player.id}" ${selectedAttr}>${player.name} (${leaderInfo.totalPoints} pts)</option>`);
    });

    select.off('change').on('change', function() {
      const val = $(this).val();
      if (!val) {
        activePlayerId = null;
        $('#active-player-name-label').text('Ninguno');
        renderPredictionsGrid();
        return;
      }
      const id = val;
      activePlayerId = id;
      
      const activePlayer = state.players.find(p => p.id == activePlayerId);
      if (activePlayer) {
        $('#active-player-name-label').text(activePlayer.name);
      } else {
        $('#active-player-name-label').text('Ninguno');
      }
      
      renderPredictionsGrid();
    });

    const activePlayer = state.players.find(p => p.id == activePlayerId);
    if (activePlayer) {
      $('#active-player-name-label').text(activePlayer.name);
      select.val(activePlayer.id);
    } else {
      activePlayerId = null;
      $('#active-player-name-label').text('Ninguno');
      select.val('');
    }
  }

  // Renderizar Grid de Partidos en Pronósticos (con banderas)
  // Renderizar Grid de Partidos en Pronósticos (con banderas)
  function renderPredictionsGrid() {
    const grid = $('#predictions-matches-grid');
    grid.empty();

    const activePlayer = state.players.find(p => p.id == activePlayerId);
    if (!activePlayer) {
      grid.append('<p style="padding: 3rem 2rem; color: var(--text-secondary); text-align: center; font-size: 1rem; width: 100%; grid-column: 1 / -1;"><i data-lucide="info" style="width: 24px; height: 24px; color: var(--text-muted); margin-bottom: 0.5rem; display: block; margin-left: auto; margin-right: auto;"></i>Por favor, seleccione un jugador en la lista lateral para ver y editar sus pronósticos.</p>');
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      return;
    }

    if (typeof WORLD_CUP_2026_MATCHES === 'undefined') {
      grid.append('<p style="padding: 2rem; color: var(--text-muted);">Error: partidos no definidos.</p>');
      return;
    }

    const groupFilter = $('#filter-group-pred').val();
    const statusFilter = $('#filter-status-pred').val();

    let matchesCount = 0;

    // Ordenar partidos cronológicamente (por fecha, hora y ID como respaldo)
    const sortedMatches = [...WORLD_CUP_2026_MATCHES].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.time && b.time) return a.time.localeCompare(b.time);
      return a.id - b.id;
    });

    sortedMatches.forEach(match => {
      if (groupFilter !== 'ALL') {
        if (groupFilter === 'Group Stage' && match.group === '') return;
        if (groupFilter === 'Knockout Stage' && match.group !== '') return;
        if (groupFilter !== 'Group Stage' && groupFilter !== 'Knockout Stage') {
          if (match.group !== groupFilter && match.round !== groupFilter) return;
        }
      }

      const pred = activePlayer.predictions[match.id] || { goals1: "", goals2: "" };
      const hasPred = pred.goals1 !== null && pred.goals1 !== undefined && pred.goals1 !== "" &&
                       pred.goals2 !== null && pred.goals2 !== undefined && pred.goals2 !== "";

      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PENDING' && hasPred) return;
        if (statusFilter === 'SAVED' && !hasPred) return;
      }

      matchesCount++;

      const real = state.realResults[match.id] || { goals1: null, goals2: null, status: 'scheduled' };
      const isFinished = real.status === 'finished';

      // --- EXTRAER DATOS ENRIQUECIDOS ---
      const resolvedVenue = (real.api_data && real.api_data.venue) ? real.api_data.venue : match.ground;
      
      let liveClockInfo = '';
      if (real.status === 'live' && real.api_data && real.api_data.clock) {
        liveClockInfo = ` (${real.api_data.clock})`;
      }

      let statusBadgeHTML = '';
      if (real.status === 'finished') {
        statusBadgeHTML = '<span class="match-status-badge status-finished">Finalizado</span>';
      } else if (real.status === 'live') {
        statusBadgeHTML = `<span class="match-status-badge status-live">En Vivo${liveClockInfo}</span>`;
      } else {
        statusBadgeHTML = '<span class="match-status-badge status-scheduled">Pendiente</span>';
      }

      let tvHTML = '';
      if (real.api_data && real.api_data.broadcasts && real.api_data.broadcasts.length > 0) {
        tvHTML = `
          <div style="display: flex; align-items: center; gap: 0.25rem; font-size: 0.72rem; color: var(--text-secondary); margin-top: 0.25rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.3rem; width: 100%;">
            <i data-lucide="tv" style="width: 12px; height: 12px;"></i>
            <span>Transmisión: ${real.api_data.broadcasts.join(', ')}</span>
          </div>
        `;
      }

      let homeIncidencesHTML = '';
      let awayIncidencesHTML = '';
      let detailsHTML = '';

      if (real.api_data) {
        const scorers = real.api_data.scorers || { home: [], away: [] };
        const redCards = real.api_data.red_cards || { home: [], away: [] };
        const yellowCards = real.api_data.yellow_cards || { home: [], away: [] };

        const homeInc = [];
        if (scorers.home) {
          scorers.home.forEach(s => {
            homeInc.push(`<div style="display: flex; align-items: center; gap: 0.2rem; margin-left: 2.5rem;">⚽ <span style="font-size: 0.72rem; color: var(--text-secondary);">${s.player} (${s.minute})</span></div>`);
          });
        }
        if (yellowCards.home) {
          yellowCards.home.forEach(yc => {
            homeInc.push(`<div style="display: flex; align-items: center; gap: 0.2rem; margin-left: 2.5rem;">🟨 <span style="font-size: 0.72rem; color: var(--text-secondary);">${yc.player} (${yc.minute})</span></div>`);
          });
        }
        if (redCards.home) {
          redCards.home.forEach(rc => {
            homeInc.push(`<div style="display: flex; align-items: center; gap: 0.2rem; margin-left: 2.5rem; color: #ef4444;"><span style="display: inline-block; width: 6px; height: 9px; background: #ef4444; border-radius: 1px; box-shadow: 0 0 4px rgba(239, 68, 68, 0.4);"></span> <span style="font-size: 0.72rem;">${rc.player} (${rc.minute})</span></div>`);
          });
        }
        if (homeInc.length > 0) {
          homeIncidencesHTML = `<div style="display: flex; flex-direction: column; gap: 0.1rem; width: 100%; text-align: left; margin-bottom: 0.2rem;">${homeInc.join('')}</div>`;
        }

        const awayInc = [];
        if (scorers.away) {
          scorers.away.forEach(s => {
            awayInc.push(`<div style="display: flex; align-items: center; gap: 0.2rem; margin-left: 2.5rem;">⚽ <span style="font-size: 0.72rem; color: var(--text-secondary);">${s.player} (${s.minute})</span></div>`);
          });
        }
        if (yellowCards.away) {
          yellowCards.away.forEach(yc => {
            awayInc.push(`<div style="display: flex; align-items: center; gap: 0.2rem; margin-left: 2.5rem;">🟨 <span style="font-size: 0.72rem; color: var(--text-secondary);">${yc.player} (${yc.minute})</span></div>`);
          });
        }
        if (redCards.away) {
          redCards.away.forEach(rc => {
            awayInc.push(`<div style="display: flex; align-items: center; gap: 0.2rem; margin-left: 2.5rem; color: #ef4444;"><span style="display: inline-block; width: 6px; height: 9px; background: #ef4444; border-radius: 1px; box-shadow: 0 0 4px rgba(239, 68, 68, 0.4);"></span> <span style="font-size: 0.72rem;">${rc.player} (${rc.minute})</span></div>`);
          });
        }
        if (awayInc.length > 0) {
          awayIncidencesHTML = `<div style="display: flex; flex-direction: column; gap: 0.1rem; width: 100%; text-align: left; margin-bottom: 0.2rem;">${awayInc.join('')}</div>`;
        }

        const referee = real.api_data.referee;
        const attendance = real.api_data.attendance;
        const weather = real.api_data.weather;
        
        const detailsItems = [];
        if (referee) detailsItems.push(`🏁 ${referee}`);
        if (attendance) detailsItems.push(`👥 ${attendance.toLocaleString()}`);
        if (weather) detailsItems.push(`🌤️ ${weather}`);
        
        if (detailsItems.length > 0) {
          detailsHTML = `
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; font-size: 0.68rem; color: var(--text-secondary); margin-top: 0.25rem; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 0.25rem; width: 100%;">
              <span>${detailsItems.join(' | ')}</span>
            </div>
          `;
        }
      }

      let footerFeedbackHTML = '';
      let disabledAttr = '';
      let isTimeLocked = false;

      const matchDate = getMatchStartDate(match);
      if (matchDate) {
        const now = new Date();
        const diffHours = (matchDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (diffHours < 0.5) {
          isTimeLocked = true;
        }
      }

      if (isFinished) {
        disabledAttr = 'disabled';
      } else if (!isAdminMode) {
        if (isTimeLocked) {
          disabledAttr = 'disabled';
        } else if (hasPred && !pred.unlocked) {
          disabledAttr = 'disabled';
        }
      }

      let cardBorderGlow = '';

      if (isFinished) {
        disabledAttr = 'disabled';
        const pointsData = getPlayerPointsForMatch(activePlayerId, match.id);
        
        let ptsClass = 'color: var(--text-muted);';
        let feedbackText = 'Fallo';

        if (pointsData.type === 'exact') {
          ptsClass = 'color: var(--primary); font-weight: 700;';
          feedbackText = `Marcador Exacto + Ganador (+${pointsData.points} pts)`;
          cardBorderGlow = 'border-color: rgba(16, 185, 129, 0.4); box-shadow: 0 0 10px rgba(16, 185, 129, 0.1);';
        } else if (pointsData.type === 'winner_closest') {
          ptsClass = 'color: var(--secondary); font-weight: 700;';
          feedbackText = `Ganador + Más Cercano (+${pointsData.points} pts)`;
          cardBorderGlow = 'border-color: rgba(251, 191, 36, 0.4); box-shadow: 0 0 10px var(--secondary-glow);';
        } else if (pointsData.type === 'winner') {
          ptsClass = 'color: var(--secondary); font-weight: 700;';
          feedbackText = `Ganador/Empate (+${pointsData.points} pts)`;
          cardBorderGlow = 'border-color: rgba(251, 191, 36, 0.4);';
        } else if (pointsData.type === 'closest') {
          ptsClass = 'color: var(--info); font-weight: 700;';
          feedbackText = `Más Cercano (+${pointsData.points} pts)`;
          cardBorderGlow = 'border-color: rgba(99, 102, 241, 0.4);';
        } else {
          feedbackText = 'No acertó (0 pts)';
        }

        const shootoutText = (real.api_data && real.api_data.shootout) ? ` (${real.api_data.shootout.home} - ${real.api_data.shootout.away} Pen.)` : '';

        footerFeedbackHTML = `
          <div style="display: flex; flex-direction: column; width: 100%; gap: 0.2rem; background: rgba(0,0,0,0.15); padding: 0.5rem; border-radius: var(--border-radius-sm); margin-top: 0.4rem;">
            <div style="display: flex; justify-content: space-between;">
              <span>Resultado Real:</span>
              <span style="font-weight: 700;">${real.goals1} - ${real.goals2}${shootoutText}</span>
            </div>
            <div style="display: flex; justify-content: space-between; ${ptsClass}">
              <span>Resultado Pronóstico:</span>
              <span>${feedbackText}</span>
            </div>
          </div>
        `;
      }

      let lockBadgeHTML = '';
      if (!isFinished) {
        if (isTimeLocked && !isAdminMode) {
          lockBadgeHTML = `
            <div class="lock-status-row" style="display: flex; align-items: center; gap: 0.25rem; margin-top: 0.6rem; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.03); font-size: 0.72rem; color: var(--danger);">
              <i data-lucide="lock" style="width: 12px; height: 12px;"></i>
              <span>Cerrado (Límite: 30 min antes del inicio)</span>
            </div>
          `;
        } else if (hasPred) {
          if (pred.unlocked) {
            if (isAdminMode) {
              lockBadgeHTML = `
                <div class="lock-status-row" style="display: flex; align-items: center; justify-content: space-between; margin-top: 0.6rem; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.03); font-size: 0.72rem; color: var(--primary);">
                  <span style="display: flex; align-items: center; gap: 0.25rem;"><i data-lucide="lock-open" style="width: 12px; height: 12px;"></i> Liberado por Admin</span>
                  <button class="btn-lock-toggle" data-match-id="${match.id}" data-action="lock" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; text-decoration: underline; font-size: 0.72rem; padding: 0;">Volver a Bloquear</button>
                </div>
              `;
            } else {
              lockBadgeHTML = `
                <div class="lock-status-row" style="display: flex; align-items: center; gap: 0.25rem; margin-top: 0.6rem; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.03); font-size: 0.72rem; color: var(--primary);">
                  <i data-lucide="lock-open" style="width: 12px; height: 12px;"></i>
                  <span>Editable (Liberado por Admin)</span>
                </div>
              `;
            }
          } else {
            // Bloqueado
            if (isAdminMode) {
              lockBadgeHTML = `
                <div class="lock-status-row" style="display: flex; align-items: center; justify-content: space-between; margin-top: 0.6rem; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.03); font-size: 0.72rem; color: var(--danger);">
                  <span style="display: flex; align-items: center; gap: 0.25rem;"><i data-lucide="lock" style="width: 12px; height: 12px;"></i> Bloqueado para usuario</span>
                  <button class="btn-lock-toggle" data-match-id="${match.id}" data-action="unlock" style="background: none; border: none; color: var(--primary); cursor: pointer; text-decoration: underline; font-size: 0.72rem; padding: 0;">Liberar/Desbloquear</button>
                </div>
              `;
            } else {
              lockBadgeHTML = `
                <div class="lock-status-row" style="display: flex; align-items: center; gap: 0.25rem; margin-top: 0.6rem; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.03); font-size: 0.72rem; color: var(--text-muted);">
                  <i data-lucide="lock" style="width: 12px; height: 12px;"></i>
                  <span>Bloqueado (No editable)</span>
                </div>
              `;
            }
          }
        } else {
          // Sin predicción
          if (isAdminMode) {
            lockBadgeHTML = `
              <div class="lock-status-row" style="display: flex; align-items: center; gap: 0.25rem; margin-top: 0.6rem; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.03); font-size: 0.72rem; color: var(--secondary);">
                <i data-lucide="pen-tool" style="width: 12px; height: 12px;"></i>
                <span>Pendiente de ingresar (Modo Admin)</span>
              </div>
            `;
          } else {
            lockBadgeHTML = `
              <div class="lock-status-row" style="display: flex; align-items: center; gap: 0.25rem; margin-top: 0.6rem; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.03); font-size: 0.72rem; color: var(--secondary);">
                <i data-lucide="pen-tool" style="width: 12px; height: 12px;"></i>
                <span>Pendiente de ingresar</span>
              </div>
            `;
          }
        }
      }

      const resolvedTeam1 = getTeamName(match.id, 1, match.team1);
      const resolvedTeam2 = getTeamName(match.id, 2, match.team2);
      const flag1HTML = getTeamFlagHTML(resolvedTeam1);
      const flag2HTML = getTeamFlagHTML(resolvedTeam2);

      const times = getFormattedMatchTimes(match.time);

      grid.append(`
        <div class="match-card" style="${cardBorderGlow}">
          <div class="match-card-header">
            <div style="display: flex; flex-direction: column; gap: 0.1rem; align-items: flex-start;">
              <span style="font-weight: 700; color: var(--text-primary);">${match.round}</span>
              ${match.group ? `<span class="match-group" style="font-size: 0.72rem; margin-top: 0.15rem; padding: 0.05rem 0.35rem; margin-left: 0;">${match.group}</span>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.15rem; align-items: flex-end; font-size: 0.72rem; color: var(--text-secondary); text-align: right;">
              <span style="display: flex; align-items: center; gap: 0.25rem;"><i data-lucide="calendar" style="width: 11px; height: 11px;"></i> ${match.date}</span>
              <span style="display: flex; align-items: center; gap: 0.25rem;" title="Hora original de partido"><i data-lucide="clock" style="width: 11px; height: 11px;"></i> ${times.original}</span>
              <span style="font-size: 0.68rem; color: var(--primary); font-weight: 600;">SV: ${times.sv}</span>
              <span style="font-size: 0.68rem; color: var(--secondary); font-weight: 600;">CA: ${times.ca}</span>
            </div>
          </div>
          
          <div class="match-card-body">
            <!-- Team 1 -->
            <div style="display: flex; flex-direction: column; width: 100%; margin-bottom: 0.4rem;">
              <div class="team-row" style="margin-bottom: 0.1rem;">
                <div class="team-info">
                  ${flag1HTML}
                  <span class="team-name" title="${resolvedTeam1}">${resolvedTeam1}</span>
                </div>
                <div class="score-input-container">
                  <input type="number" min="0" max="99" class="input-goal pred-input" 
                    data-match-id="${match.id}" data-team="1" 
                    value="${pred.goals1 !== null && pred.goals1 !== undefined ? pred.goals1 : ''}" 
                    ${disabledAttr}>
                </div>
              </div>
              ${homeIncidencesHTML}
            </div>
            
            <!-- Team 2 -->
            <div style="display: flex; flex-direction: column; width: 100%; margin-bottom: 0.4rem;">
              <div class="team-row" style="margin-bottom: 0.1rem;">
                <div class="team-info">
                  ${flag2HTML}
                  <span class="team-name" title="${resolvedTeam2}">${resolvedTeam2}</span>
                </div>
                <div class="score-input-container">
                  <input type="number" min="0" max="99" class="input-goal pred-input" 
                    data-match-id="${match.id}" data-team="2" 
                    value="${pred.goals2 !== null && pred.goals2 !== undefined ? pred.goals2 : ''}" 
                    ${disabledAttr}>
                </div>
              </div>
              ${awayIncidencesHTML}
            </div>

            ${lockBadgeHTML}
            ${footerFeedbackHTML}
          </div>

          <div class="match-card-footer" style="flex-direction: column; align-items: stretch; gap: 0.3rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <span class="match-venue" title="${resolvedVenue}"><i data-lucide="map-pin" style="width: 11px; height: 11px; display: inline-align; vertical-align: middle; margin-right: 0.15rem;"></i> ${resolvedVenue}</span>
              ${statusBadgeHTML}
            </div>
            ${tvHTML}
            ${detailsHTML}
          </div>
        </div>
      `);
    });

    if (matchesCount === 0) {
      grid.append(`
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 4rem 2rem;">
          <i data-lucide="filter" style="width: 48px; height: 48px; margin-bottom: 0.8rem; opacity: 0.6;"></i>
          <p>No hay partidos que coincidan con los filtros seleccionados.</p>
        </div>
      `);
    }

    lucide.createIcons();

    $('.pred-input').off('change').on('change', function() {
      const matchId = $(this).data('match-id');
      const card = $(this).closest('.match-card');
      const val1 = card.find('.pred-input[data-team="1"]').val();
      const val2 = card.find('.pred-input[data-team="2"]').val();

      const pIdx = state.players.findIndex(p => p.id == activePlayerId);
      if (pIdx === -1) return;

      const pred = state.players[pIdx].predictions[matchId] || { goals1: "", goals2: "" };
      const hasPred = pred.goals1 !== null && pred.goals1 !== undefined && pred.goals1 !== "" &&
                       pred.goals2 !== null && pred.goals2 !== undefined && pred.goals2 !== "";

      // Validar límite de tiempo (30 minutos antes) si no es administrador
      if (!isAdminMode) {
        const match = WORLD_CUP_2026_MATCHES.find(m => m.id == matchId);
        const matchDate = getMatchStartDate(match);
        if (matchDate) {
          const now = new Date();
          const diffHours = (matchDate.getTime() - now.getTime()) / (1000 * 60 * 60);
          if (diffHours < 0.5) {
            showToast("Límite de tiempo superado. Los pronósticos se bloquean 30 minutos antes del partido.", "error");
            renderPredictionsGrid();
            return;
          }
        }
      }

      // Si no es admin y ya tenía una predicción completa y no está liberada, no permitir guardar
      if (!isAdminMode && hasPred && !pred.unlocked) {
        showToast("Este pronóstico está bloqueado. Pide al administrador que lo libere.", "error");
        renderPredictionsGrid();
        return;
      }

      if (val1 === "" && val2 === "") {
        delete state.players[pIdx].predictions[matchId];
        saveState({ type: 'prediction', playerId: activePlayerId, matchId: matchId });
        showSaveIndicator(true);
        renderPredictionsGrid();
        return;
      }

      if (!state.players[pIdx].predictions[matchId]) {
        state.players[pIdx].predictions[matchId] = { goals1: "", goals2: "" };
      }

      state.players[pIdx].predictions[matchId].goals1 = val1;
      state.players[pIdx].predictions[matchId].goals2 = val2;

      // Si el usuario guardó un marcador completo (ambos goles), bloquearlo quitando la bandera de desbloqueo
      const nowHasPred = val1 !== "" && val1 !== null && val1 !== undefined &&
                         val2 !== "" && val2 !== null && val2 !== undefined;
      if (nowHasPred && !isAdminMode) {
        state.players[pIdx].predictions[matchId].unlocked = false;
      }

      saveState({ type: 'prediction', playerId: activePlayerId, matchId: matchId });
      showSaveIndicator(true);
      renderDashboard();
      renderPredictionsGrid();
    });

    $('.btn-lock-toggle').off('click').on('click', function(e) {
      e.preventDefault();
      if (!isAdminMode) return;

      const matchId = $(this).data('match-id');
      const action = $(this).data('action');

      const pIdx = state.players.findIndex(p => p.id == activePlayerId);
      if (pIdx === -1) return;

      if (!state.players[pIdx].predictions[matchId]) {
        state.players[pIdx].predictions[matchId] = { goals1: "", goals2: "" };
      }

      state.players[pIdx].predictions[matchId].unlocked = (action === 'unlock');
      saveState({ type: 'prediction', playerId: activePlayerId, matchId: matchId });

      renderPredictionsGrid();

      const msg = action === 'unlock' ? "Pronóstico liberado para el usuario." : "Pronóstico bloqueado para el usuario.";
      showToast(msg);
    });
  }

  function showSaveIndicator(show) {
    const indicator = $('#save-status-indicator');
    if (show) {
      indicator.stop(true, true).css('opacity', 1).fadeIn(200);
      setTimeout(() => {
        indicator.fadeOut(800);
      }, 1500);
    }
  }

  // Renderizar Grid de Administración de Resultados Reales (con banderas y bloqueo)
  function renderAdminGrid() {
    const grid = $('#admin-matches-grid');
    grid.empty();

    if (typeof WORLD_CUP_2026_MATCHES === 'undefined') return;

    const groupFilter = $('#filter-group-admin').val();
    const statusFilter = $('#filter-status-admin').val();

    let matchCount = 0;
    const disabledAttr = isAdminMode ? '' : 'disabled';

    // Ordenar partidos cronológicamente (por fecha, hora y ID como respaldo)
    const sortedMatches = [...WORLD_CUP_2026_MATCHES].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.time && b.time) return a.time.localeCompare(b.time);
      return a.id - b.id;
    });

    sortedMatches.forEach(match => {
      if (groupFilter !== 'ALL') {
        if (groupFilter === 'Group Stage' && match.group === '') return;
        if (groupFilter === 'Knockout Stage' && match.group !== '') return;
        if (groupFilter !== 'Group Stage' && groupFilter !== 'Knockout Stage') {
          if (match.group !== groupFilter && match.round !== groupFilter) return;
        }
      }

      const real = state.realResults[match.id] || { goals1: null, goals2: null, status: 'scheduled' };

      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PLAYED' && real.status !== 'finished') return;
        if (statusFilter === 'UNPLAYED' && real.status === 'finished') return;
      }

      matchCount++;

      const resolvedTeam1 = getTeamName(match.id, 1, match.team1);
      const resolvedTeam2 = getTeamName(match.id, 2, match.team2);
      const flag1HTML = getTeamFlagHTML(resolvedTeam1);
      const flag2HTML = getTeamFlagHTML(resolvedTeam2);

      const times = getFormattedMatchTimes(match.time);

      grid.append(`
        <div class="match-card" style="${real.status === 'live' ? 'border-color: var(--info);' : ''}">
          <div class="match-card-header">
            <div style="display: flex; flex-direction: column; gap: 0.1rem; align-items: flex-start;">
              <span style="font-weight: 700; color: var(--text-primary);">${match.round}</span>
              ${match.group ? `<span class="match-group" style="font-size: 0.72rem; margin-top: 0.15rem; padding: 0.05rem 0.35rem; margin-left: 0;">${match.group}</span>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.15rem; align-items: flex-end; font-size: 0.72rem; color: var(--text-secondary); text-align: right;">
              <span style="display: flex; align-items: center; gap: 0.25rem;"><i data-lucide="calendar" style="width: 11px; height: 11px;"></i> ${match.date}</span>
              <span style="display: flex; align-items: center; gap: 0.25rem;" title="Hora original de partido"><i data-lucide="clock" style="width: 11px; height: 11px;"></i> ${times.original}</span>
              <span style="font-size: 0.68rem; color: var(--primary); font-weight: 600;">SV: ${times.sv}</span>
              <span style="font-size: 0.68rem; color: var(--secondary); font-weight: 600;">CA: ${times.ca}</span>
            </div>
          </div>
          
          <div class="match-card-body">
            <!-- Team 1 -->
            <div class="team-row">
              <div class="team-info" style="width: 100%; display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
                ${flag1HTML}
                <input type="text" class="input-text admin-team-name-input" 
                  data-match-id="${match.id}" data-team="1" 
                  value="${resolvedTeam1}" 
                  placeholder="Equipo 1"
                  style="flex: 1; padding: 0.3rem 0.5rem; font-size: 0.85rem; height: 32px; min-width: 80px;"
                  ${disabledAttr}>
              </div>
              <div class="score-input-container">
                <input type="number" min="0" max="99" class="input-goal admin-goal-input" 
                  data-match-id="${match.id}" data-team="1" 
                  value="${real.goals1 !== null && real.goals1 !== undefined ? real.goals1 : ''}"
                  ${disabledAttr}>
              </div>
            </div>
            
            <!-- Team 2 -->
            <div class="team-row">
              <div class="team-info" style="width: 100%; display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
                ${flag2HTML}
                <input type="text" class="input-text admin-team-name-input" 
                  data-match-id="${match.id}" data-team="2" 
                  value="${resolvedTeam2}" 
                  placeholder="Equipo 2"
                  style="flex: 1; padding: 0.3rem 0.5rem; font-size: 0.85rem; height: 32px; min-width: 80px;"
                  ${disabledAttr}>
              </div>
              <div class="score-input-container">
                <input type="number" min="0" max="99" class="input-goal admin-goal-input" 
                  data-match-id="${match.id}" data-team="2" 
                  value="${real.goals2 !== null && real.goals2 !== undefined ? real.goals2 : ''}"
                  ${disabledAttr}>
              </div>
            </div>

            <!-- Match status selector -->
            <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.3rem;">
              <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Estado:</span>
              <select class="select-custom admin-status-select" data-match-id="${match.id}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; flex: 1;" ${disabledAttr}>
                <option value="scheduled" ${real.status === 'scheduled' ? 'selected' : ''}>Pendiente</option>
                <option value="live" ${real.status === 'live' ? 'selected' : ''}>En Vivo</option>
                <option value="finished" ${real.status === 'finished' ? 'selected' : ''}>Finalizado</option>
              </select>
            </div>
          </div>

          <div class="match-card-footer">
            <span class="match-venue" title="${match.ground}">${match.ground}</span>
            <span>ID: ${match.id}</span>
          </div>
        </div>
      `);
    });

    if (matchCount === 0) {
      grid.append(`
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 4rem 2rem;">
          <i data-lucide="filter" style="width: 48px; height: 48px; margin-bottom: 0.8rem; opacity: 0.6;"></i>
          <p>No hay partidos que coincidan con los filtros seleccionados.</p>
        </div>
      `);
    }

    lucide.createIcons();

    $('.admin-team-name-input').off('change').on('change', function() {
      if (!isAdminMode) {
        showToast("Error: Acceso Administrador requerido.", "error");
        renderAdminGrid();
        return;
      }
      const matchId = $(this).data('match-id');
      const teamNum = $(this).data('team');
      const newName = $(this).val().trim();

      if (!state.matchTeams[matchId]) {
        state.matchTeams[matchId] = { team1: "", team2: "" };
      }

      if (teamNum === 1) {
        state.matchTeams[matchId].team1 = newName;
      } else {
        state.matchTeams[matchId].team2 = newName;
      }

      saveState({ type: 'match-teams', matchId: matchId });
      renderDashboard();
      renderLeaderboard();
      // Rerenderizar la grilla de administración para recargar las banderas del nuevo país ingresado
      renderAdminGrid();
      showToast(`Nombre del equipo actualizado.`);
    });

    $('.admin-goal-input, .admin-status-select').off('change').on('change', function() {
      if (!isAdminMode) {
        showToast("Error: Acceso Administrador requerido.", "error");
        renderAdminGrid();
        return;
      }

      const matchId = $(this).data('match-id');
      const card = $(this).closest('.match-card');
      const goals1 = card.find('.admin-goal-input[data-team="1"]').val();
      const goals2 = card.find('.admin-goal-input[data-team="2"]').val();
      const status = card.find('.admin-status-select').val();

      state.realResults[matchId] = {
        goals1: goals1 === "" ? null : parseInt(goals1),
        goals2: goals2 === "" ? null : parseInt(goals2),
        status: status
      };

      if (status === 'finished' && (goals1 === "" || goals2 === "")) {
        showToast("Advertencia: Marcador incompleto para partido finalizado.", "error");
      }

      saveState({ type: 'real-results', matchId: matchId });
      renderDashboard();
      renderLeaderboard();
      showToast(`Partido ID ${matchId} actualizado.`);
    });
  }

  // Obtener fecha actual en formato YYYY-MM-DD en la zona horaria de El Salvador (UTC-6)
  function getElSalvadorDateString() {
    const now = new Date();
    const utcOffset = now.getTimezoneOffset() * 60000;
    const utcTime = now.getTime() + utcOffset;
    // El Salvador está a UTC-6 horas
    const elSalvadorTime = new Date(utcTime - (6 * 3600000));
    
    const year = elSalvadorTime.getFullYear();
    const month = String(elSalvadorTime.getMonth() + 1).padStart(2, '0');
    const day = String(elSalvadorTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Renderizar Calendario general (con banderas y estadísticas)
  function renderScheduleGrid() {
    const grid = $('#schedule-matches-grid');
    grid.empty();

    if (typeof WORLD_CUP_2026_MATCHES === 'undefined') return;

    const groupFilter = $('#filter-group-schedule').val();
    const searchTerm = $('#search-team-schedule').val().trim().toLowerCase();

    let matchesCount = 0;

    // Ordenar partidos cronológicamente (por fecha, hora y ID como respaldo)
    const sortedMatches = [...WORLD_CUP_2026_MATCHES].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.time && b.time) return a.time.localeCompare(b.time);
      return a.id - b.id;
    });

    // Agrupar todos los partidos por fecha (del total de partidos) para determinar si un día completo ya finalizó
    const allMatchesByDate = {};
    WORLD_CUP_2026_MATCHES.forEach(match => {
      if (!allMatchesByDate[match.date]) {
        allMatchesByDate[match.date] = [];
      }
      allMatchesByDate[match.date].push(match);
    });

    const todayStr = getElSalvadorDateString();

    const isActiveDate = (date) => {
      // Si la fecha del partido es hoy o en el futuro, es activa
      if (date >= todayStr) return true;
      // Si la fecha es pasada, pero al menos un partido en esa fecha no ha finalizado aún
      const matchesForDate = allMatchesByDate[date] || [];
      return matchesForDate.some(m => {
        const real = state.realResults[m.id] || { status: 'scheduled' };
        return real.status !== 'finished';
      });
    };

    const matchesByDate = {};

    sortedMatches.forEach(match => {
      if (groupFilter !== 'ALL') {
        if (groupFilter === 'Group Stage' && match.group === '') return;
        if (groupFilter === 'Knockout Stage' && match.group !== '') return;
        if (groupFilter !== 'Group Stage' && groupFilter !== 'Knockout Stage') {
          if (match.group !== groupFilter && match.round !== groupFilter) return;
        }
      }

      const resolvedTeam1 = getTeamName(match.id, 1, match.team1);
      const resolvedTeam2 = getTeamName(match.id, 2, match.team2);

      if (searchTerm) {
        const team1Match = resolvedTeam1.toLowerCase().includes(searchTerm);
        const team2Match = resolvedTeam2.toLowerCase().includes(searchTerm);
        if (!team1Match && !team2Match) return;
      }

      matchesCount++;

      if (!matchesByDate[match.date]) {
        matchesByDate[match.date] = [];
      }
      matchesByDate[match.date].push({
        match,
        resolvedTeam1,
        resolvedTeam2
      });
    });

    $('#schedule-matches-count').text(matchesCount);

    if (matchesCount === 0) {
      grid.append(`
        <div style="text-align: center; color: var(--text-muted); padding: 4rem 2rem; width: 100%;">
          <i data-lucide="filter" style="width: 48px; height: 48px; margin-bottom: 0.8rem; opacity: 0.6; display: block; margin-left: auto; margin-right: auto;"></i>
          <p>No se encontraron partidos para la búsqueda seleccionada.</p>
        </div>
      `);
      lucide.createIcons();
      return;
    }

    // Separar fechas filtradas en activas/futuras vs pasadas
    const activeDates = [];
    const pastDates = [];

    Object.keys(matchesByDate).forEach(date => {
      if (isActiveDate(date)) {
        activeDates.push(date);
      } else {
        pastDates.push(date);
      }
    });

    // Ordenar fechas: activas de forma ascendente (cercanos primero), pasadas de forma descendente (recientes primero)
    activeDates.sort();
    pastDates.sort().reverse();

    // Función auxiliar para renderizar un día y sus partidos
    function renderDay(date, container) {
      const dayMatches = matchesByDate[date];
      if (!dayMatches) return;

      const formattedDate = formatDateSpanish(date);

      // Agregar cabecera del día
      container.append(`
        <div class="schedule-day-group" style="margin-top: 1.5rem; margin-bottom: 0.8rem; width: 100%;">
          <h3 style="
            font-size: 1.15rem;
            font-weight: 700;
            color: var(--primary);
            font-family: 'Outfit', sans-serif;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            border-bottom: 1.5px solid rgba(16, 185, 129, 0.15);
            padding-bottom: 0.4rem;
          ">
            <i data-lucide="calendar" style="width: 18px; height: 18px;"></i>
            ${formattedDate}
          </h3>
        </div>
      `);

      // Crear un contenedor matches-grid para este día
      const dayGridId = `day-grid-${date}`;
      container.append(`
        <div class="matches-grid" id="${dayGridId}" style="margin-bottom: 1rem;"></div>
      `);

      const dayGrid = $(`#${dayGridId}`);

      dayMatches.forEach(item => {
        const match = item.match;
        const resolvedTeam1 = item.resolvedTeam1;
        const resolvedTeam2 = item.resolvedTeam2;

        const real = state.realResults[match.id] || { goals1: null, goals2: null, status: 'scheduled' };

        // --- EXTRAER DATOS ENRIQUECIDOS ---
        const resolvedVenue = (real.api_data && real.api_data.venue) ? real.api_data.venue : match.ground;
        
        let liveClockInfo = '';
        if (real.status === 'live' && real.api_data && real.api_data.clock) {
          liveClockInfo = ` (${real.api_data.clock})`;
        }

        let scoreHTML = '';
        let statusBadgeHTML = '';

        const shootoutText = (real.api_data && real.api_data.shootout) ? `<div style="font-size: 0.68rem; color: var(--text-secondary); margin-top: 0.2rem;">(${real.api_data.shootout.home}-${real.api_data.shootout.away} Pen)</div>` : '';

        if (real.status === 'finished') {
          scoreHTML = `
            <div style="display: flex; flex-direction: column; align-items: center;">
              <span class="schedule-score-display">${real.goals1} - ${real.goals2}</span>
              ${shootoutText}
            </div>
          `;
          statusBadgeHTML = '<span class="match-status-badge status-finished">Finalizado</span>';
        } else if (real.status === 'live') {
          scoreHTML = `<span class="schedule-score-display" style="color: var(--info); border-color: var(--info); box-shadow: 0 0 8px rgba(14, 165, 233, 0.25);">${real.goals1 !== null ? real.goals1 : 0} - ${real.goals2 !== null ? real.goals2 : 0}</span>`;
          statusBadgeHTML = `<span class="match-status-badge status-live">En Vivo${liveClockInfo}</span>`;
        } else {
          scoreHTML = '<span class="schedule-vs-badge">VS</span>';
          statusBadgeHTML = '<span class="match-status-badge status-scheduled">Pendiente</span>';
        }

        let tvHTML = '';
        if (real.api_data && real.api_data.broadcasts && real.api_data.broadcasts.length > 0) {
          tvHTML = `
            <div style="display: flex; align-items: center; gap: 0.25rem; font-size: 0.72rem; color: var(--text-secondary); margin-top: 0.25rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.3rem; width: 100%;">
              <i data-lucide="tv" style="width: 12px; height: 12px;"></i>
              <span>Transmisión: ${real.api_data.broadcasts.join(', ')}</span>
            </div>
          `;
        }

        let homeIncidencesHTML = '';
        let awayIncidencesHTML = '';
        let detailsHTML = '';

        if (real.api_data) {
          const scorers = real.api_data.scorers || { home: [], away: [] };
          const redCards = real.api_data.red_cards || { home: [], away: [] };
          const yellowCards = real.api_data.yellow_cards || { home: [], away: [] };

          const homeInc = [];
          if (scorers.home) {
            scorers.home.forEach(s => {
              homeInc.push(`<div style="display: flex; align-items: center; gap: 0.2rem; justify-content: flex-start;">⚽ <span style="font-size: 0.72rem; color: var(--text-secondary);">${s.player} (${s.minute})</span></div>`);
            });
          }
          if (yellowCards.home) {
            yellowCards.home.forEach(yc => {
              homeInc.push(`<div style="display: flex; align-items: center; gap: 0.2rem; justify-content: flex-start;">🟨 <span style="font-size: 0.72rem; color: var(--text-secondary);">${yc.player} (${yc.minute})</span></div>`);
            });
          }
          if (redCards.home) {
            redCards.home.forEach(rc => {
              homeInc.push(`<div style="display: flex; align-items: center; gap: 0.2rem; justify-content: flex-start; color: #ef4444;"><span style="display: inline-block; width: 6px; height: 9px; background: #ef4444; border-radius: 1px; box-shadow: 0 0 4px rgba(239, 68, 68, 0.4);"></span> <span style="font-size: 0.72rem;">${rc.player} (${rc.minute})</span></div>`);
            });
          }
          if (homeInc.length > 0) {
            homeIncidencesHTML = `<div style="display: flex; flex-direction: column; gap: 0.1rem; width: 100%;">${homeInc.join('')}</div>`;
          }

          const awayInc = [];
          if (scorers.away) {
            scorers.away.forEach(s => {
              awayInc.push(`<div style="display: flex; align-items: center; gap: 0.2rem; justify-content: flex-end;">⚽ <span style="font-size: 0.72rem; color: var(--text-secondary);">${s.player} (${s.minute})</span></div>`);
            });
          }
          if (yellowCards.away) {
            yellowCards.away.forEach(yc => {
              awayInc.push(`<div style="display: flex; align-items: center; gap: 0.2rem; justify-content: flex-end;">🟨 <span style="font-size: 0.72rem; color: var(--text-secondary);">${yc.player} (${yc.minute})</span></div>`);
            });
          }
          if (redCards.away) {
            redCards.away.forEach(rc => {
              awayInc.push(`<div style="display: flex; align-items: center; gap: 0.2rem; justify-content: flex-end; color: #ef4444;"><span style="display: inline-block; width: 6px; height: 9px; background: #ef4444; border-radius: 1px; box-shadow: 0 0 4px rgba(239, 68, 68, 0.4);"></span> <span style="font-size: 0.72rem;">${rc.player} (${rc.minute})</span></div>`);
            });
          }
          if (awayInc.length > 0) {
            awayIncidencesHTML = `<div style="display: flex; flex-direction: column; gap: 0.1rem; width: 100%;">${awayInc.join('')}</div>`;
          }

          const referee = real.api_data.referee;
          const attendance = real.api_data.attendance;
          const weather = real.api_data.weather;
          
          const detailsItems = [];
          if (referee) detailsItems.push(`🏁 ${referee}`);
          if (attendance) detailsItems.push(`👥 ${attendance.toLocaleString()}`);
          if (weather) detailsItems.push(`🌤️ ${weather}`);
          
          if (detailsItems.length > 0) {
            detailsHTML = `
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; font-size: 0.68rem; color: var(--text-secondary); margin-top: 0.25rem; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 0.25rem; width: 100%;">
                <span>${detailsItems.join(' | ')}</span>
              </div>
            `;
          }
        }

        let predictedCount = 0;
        state.players.forEach(p => {
          const pred = p.predictions[match.id];
          if (pred && pred.goals1 !== null && pred.goals1 !== "" && pred.goals2 !== null && pred.goals2 !== "") {
            predictedCount++;
          }
        });
        const totalPlayers = state.players.length;

        const times = getFormattedMatchTimes(match.time);
        const flag1HTML = getTeamFlagHTML(resolvedTeam1);
        const flag2HTML = getTeamFlagHTML(resolvedTeam2);

        dayGrid.append(`
          <div class="match-card" style="${real.status === 'live' ? 'border-color: var(--info);' : ''}">
            <div class="match-card-header">
              <div style="display: flex; flex-direction: column; gap: 0.1rem; align-items: flex-start;">
                <span style="font-weight: 700; color: var(--text-primary);">${match.round}</span>
                ${match.group ? `<span class="match-group" style="font-size: 0.72rem; margin-top: 0.15rem; padding: 0.05rem 0.35rem; margin-left: 0;">${match.group}</span>` : ''}
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.15rem; align-items: flex-end; font-size: 0.72rem; color: var(--text-secondary); text-align: right;">
                <span style="display: flex; align-items: center; gap: 0.25rem;"><i data-lucide="calendar" style="width: 11px; height: 11px;"></i> ${match.date}</span>
                <span style="display: flex; align-items: center; gap: 0.25rem;" title="Hora original de partido"><i data-lucide="clock" style="width: 11px; height: 11px;"></i> ${times.original}</span>
                <span style="font-size: 0.68rem; color: var(--primary); font-weight: 600;">SV: ${times.sv}</span>
                <span style="font-size: 0.68rem; color: var(--secondary); font-weight: 600;">CA: ${times.ca}</span>
              </div>
            </div>
            
            <div class="match-card-body" style="align-items: center; justify-content: center; padding: 0.5rem 0;">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 0.8rem;">
                
                <!-- Team 1 -->
                <div style="display: flex; flex-direction: column; align-items: center; gap: 0.4rem; flex: 1; text-align: center;">
                  <div style="height: 30px; display: flex; align-items: center; justify-content: center;">
                    ${flag1HTML}
                  </div>
                  <span class="team-name" style="max-width: 100px; font-size: 0.85rem;" title="${resolvedTeam1}">${resolvedTeam1}</span>
                </div>
                
                <!-- Score / VS -->
                <div style="display: flex; align-items: center; justify-content: center; min-width: 80px;">
                  ${scoreHTML}
                </div>
                
                <!-- Team 2 -->
                <div style="display: flex; flex-direction: column; align-items: center; gap: 0.4rem; flex: 1; text-align: center;">
                  <div style="height: 30px; display: flex; align-items: center; justify-content: center;">
                    ${flag2HTML}
                  </div>
                  <span class="team-name" style="max-width: 100px; font-size: 0.85rem;" title="${resolvedTeam2}">${resolvedTeam2}</span>
                </div>
                
              </div>

              <!-- Incidences row -->
              ${(homeIncidencesHTML || awayIncidencesHTML) ? `
                <div class="match-incidences-container" style="display: flex; justify-content: space-between; width: 100%; border-top: 1px solid rgba(255, 255, 255, 0.04); padding-top: 0.4rem; margin-top: 0.4rem; gap: 0.5rem;">
                  <div style="flex: 1; text-align: left;">
                    ${homeIncidencesHTML}
                  </div>
                  <div style="flex: 1; text-align: right;">
                    ${awayIncidencesHTML}
                  </div>
                </div>
              ` : ''}
            </div>

            <div class="match-card-footer" style="flex-direction: column; gap: 0.5rem; align-items: stretch; border-top: none; padding-top: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted); border-top: 1px solid rgba(255, 255, 255, 0.04); padding-top: 0.5rem; margin-top: 0.2rem;">
                <span class="match-venue" title="${resolvedVenue}"><i data-lucide="map-pin" style="width: 11px; height: 11px; display: inline-align; vertical-align: middle; margin-right: 0.15rem;"></i> ${resolvedVenue}</span>
                ${statusBadgeHTML}
              </div>
              ${tvHTML}
              ${detailsHTML}
              <div class="schedule-pred-stats" data-match-id="${match.id}">
                <i data-lucide="users" style="width: 13px; height: 13px;"></i>
                <span>${predictedCount} de ${totalPlayers} jugadores pronosticaron este partido</span>
              </div>
            </div>
          </div>
        `);
      });
    }

    // Renderizar fechas activas
    activeDates.forEach(date => {
      renderDay(date, grid);
    });

    // Renderizar fechas pasadas (dentro de contenedor colapsable)
    if (pastDates.length > 0) {
      let pastMatchesCount = 0;
      pastDates.forEach(date => {
        pastMatchesCount += matchesByDate[date].length;
      });

      const shouldExpandPast = (activeDates.length === 0) || (searchTerm !== '') || (groupFilter !== 'ALL');

      grid.append(`
        <div class="past-matches-header" style="margin-top: 2rem; margin-bottom: 1rem; width: 100%; display: flex; align-items: center; gap: 1rem;">
          <hr style="flex-grow: 1; border: none; border-top: 1.5px solid var(--border-color); opacity: 0.3;">
          <button id="btn-toggle-past-matches" class="btn btn-secondary" style="
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            border-radius: var(--border-radius-md);
            background-color: var(--surface-color);
            backdrop-filter: var(--glass-blur);
            font-size: 0.88rem;
            font-weight: 600;
            white-space: nowrap;
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            transition: all var(--transition-fast);
          ">
            <i data-lucide="chevron-down" id="toggle-past-icon" style="
              width: 16px; 
              height: 16px; 
              transition: transform var(--transition-normal);
              transform: ${shouldExpandPast ? 'rotate(180deg)' : 'rotate(0deg)'};
            "></i>
            <span>Partidos Anteriores (${pastMatchesCount})</span>
          </button>
          <hr style="flex-grow: 1; border: none; border-top: 1.5px solid var(--border-color); opacity: 0.3;">
        </div>
        <div id="past-matches-container" style="
          display: ${shouldExpandPast ? 'flex' : 'none'}; 
          flex-direction: column; 
          gap: 1rem; 
          width: 100%;
        "></div>
      `);

      const pastContainer = $('#past-matches-container');
      pastDates.forEach(date => {
        renderDay(date, pastContainer);
      });
    }

    lucide.createIcons();
  }

  // Convertir fecha de matches.js a UTC Date para comparación con ESPN
  function getMatchUtcDate(matchDateStr, matchTimeStr) {
    const match = matchTimeStr.match(/(\d{2}):(\d{2})\s+UTC([+-]\d+)/);
    if (!match) return new Date(matchDateStr + 'T' + matchTimeStr.split(' ')[0] + ':00Z');
    
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const offset = parseInt(match[3]);
    
    const parts = matchDateStr.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const day = parseInt(parts[2]);
    
    const dateUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes));
    dateUtc.setUTCHours(dateUtc.getUTCHours() - offset);
    return dateUtc;
  }

  // Sincronizar resultados reales en tiempo real con ESPN API
  function syncWithESPN() {
    if (!isAdminMode) {
      showToast("Acceso Administrador requerido.", "error");
      return;
    }

    const btn = $('#btn-sync-espn');
    btn.prop('disabled', true).html('<i data-lucide="refresh-cw" class="spin" style="animation: spin 1s linear infinite;"></i> Sincronizando...');
    lucide.createIcons();

    showToast("Conectando con la API de ESPN...", "info");

    const espnUrl = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260725';

    $.ajax({
      url: espnUrl,
      type: 'GET',
      dataType: 'json',
      cache: false,
      success: async function(data) {
        const events = data.events || [];
        if (events.length === 0) {
          showToast("No se encontraron partidos en la API de ESPN.", "error");
          btn.prop('disabled', false).html('<i data-lucide="refresh-cw"></i> Sincronizar ESPN (En Vivo)');
          lucide.createIcons();
          return;
        }

        let updatedResultsCount = 0;
        let updatedTeamsCount = 0;
        const localMatches = WORLD_CUP_2026_MATCHES;
        const saveQueue = [];

        events.forEach(event => {
          const comps = event.competitions && event.competitions[0];
          if (!comps) return;
          const competitors = comps.competitors || [];
          if (competitors.length < 2) return;

          const homeComp = competitors.find(c => c.homeAway === 'home') || competitors[0];
          const awayComp = competitors.find(c => c.homeAway === 'away') || competitors[1];

          const espnHomeTeam = homeComp.team.displayName;
          const espnAwayTeam = awayComp.team.displayName;

          const espnHomeScoreStr = homeComp.score;
          const espnAwayScoreStr = awayComp.score;

          const espnState = event.status && event.status.type && event.status.type.state;
          const espnCompleted = event.status && event.status.type && event.status.type.completed;

          let goals1 = null;
          let goals2 = null;
          let status = 'scheduled';

          if (espnState === 'in') {
            status = 'live';
            goals1 = parseInt(espnHomeScoreStr);
            goals2 = parseInt(espnAwayScoreStr);
          } else if (espnState === 'post' || espnCompleted === true) {
            status = 'finished';
            goals1 = parseInt(espnHomeScoreStr);
            goals2 = parseInt(espnAwayScoreStr);
          }

          // Encontrar el partido correspondiente en local
          let localMatch = null;
          let reversed = false;

          const normHome = normalizeTeamName(espnHomeTeam);
          const normAway = normalizeTeamName(espnAwayTeam);

          // 1. Intentar coincidir por nombres de equipos (Fase de Grupos)
          localMatch = localMatches.find(m => {
            const isGroup = m.group && m.group.startsWith('Group');
            if (!isGroup) return false;
            
            const locT1 = normalizeTeamName(m.team1);
            const locT2 = normalizeTeamName(m.team2);

            if (locT1 === normHome && locT2 === normAway) {
              return true;
            }
            if (locT1 === normAway && locT2 === normHome) {
              reversed = true;
              return true;
            }
            return false;
          });

          // 2. Si no se encuentra (Fase Eliminatoria o llaves), coincidir por fecha y hora
          if (!localMatch) {
            const espnUtcDate = new Date(event.date);
            localMatch = localMatches.find(m => {
              const localUtcDate = getMatchUtcDate(m.date, m.time);
              return Math.abs(espnUtcDate - localUtcDate) < 60000;
            });
            
            if (localMatch) {
              // Si coincide por fecha/hora y es eliminatoria, chequear si cambiaron los nombres de los equipos
              const currentT1 = getTeamName(localMatch.id, 1, localMatch.team1);
              const currentT2 = getTeamName(localMatch.id, 2, localMatch.team2);

              if (currentT1 !== espnHomeTeam || currentT2 !== espnAwayTeam) {
                if (!state.matchTeams) state.matchTeams = {};
                state.matchTeams[localMatch.id] = {
                  team1: espnHomeTeam,
                  team2: espnAwayTeam
                };
                
                saveQueue.push({
                  url: 'api.php?action=save_match_team',
                  payload: {
                    match_id: localMatch.id,
                    team1: espnHomeTeam,
                    team2: espnAwayTeam
                  },
                  onSuccess: () => { updatedTeamsCount++; }
                });
              }
            }
          }

          if (localMatch) {
            const finalGoals1 = reversed ? goals2 : goals1;
            const finalGoals2 = reversed ? goals1 : goals2;

            // --- EXTRAER DATOS ENRIQUECIDOS ---
            const espnVenue = comps.venue ? comps.venue.fullName : null;

            const espnBroadcasts = [];
            if (comps.broadcasts) {
              comps.broadcasts.forEach(b => {
                if (b.names) {
                  b.names.forEach(name => {
                    if (espnBroadcasts.indexOf(name) === -1) {
                      espnBroadcasts.push(name);
                    }
                  });
                }
              });
            }

            const espnDisplayClock = event.status ? event.status.displayClock : null;

            const scorers = { home: [], away: [] };
            const red_cards = { home: [], away: [] };
            const yellow_cards = { home: [], away: [] };

            if (comps.details) {
              comps.details.forEach(det => {
                const isGoal = det.type && det.type.text && (det.type.text.toLowerCase().indexOf('goal') !== -1);
                let isRedCard = det.redCard === true;
                let isYellowCard = false;
                
                if (!isGoal && !isRedCard && det.type && det.type.text) {
                  const typeText = det.type.text.toLowerCase();
                  if (typeText.indexOf('red card') !== -1) {
                    isRedCard = true;
                  } else if (typeText.indexOf('yellow card') !== -1) {
                    isYellowCard = true;
                  }
                }

                if (isGoal || isRedCard || isYellowCard) {
                  const teamId = det.team ? det.team.id : null;
                  const minute = det.clock ? det.clock.displayValue : '';
                  
                  let player = '';
                  if (det.athletesInvolved && det.athletesInvolved[0]) {
                    player = det.athletesInvolved[0].displayName || det.athletesInvolved[0].shortName || '';
                  }

                  if (teamId !== null) {
                    let side = (teamId == homeComp.team.id) ? 'home' : 'away';
                    if (reversed) {
                      side = (side === 'home') ? 'away' : 'home';
                    }

                    if (isGoal) {
                      scorers[side].push({ player: player, minute: minute });
                    } else if (isRedCard) {
                      red_cards[side].push({ player: player, minute: minute });
                    } else {
                      yellow_cards[side].push({ player: player, minute: minute });
                    }
                  }
                }
              });
            }

            const espnReferee = comps.referees && comps.referees.length > 0 ? comps.referees[0].displayName : null;
            const espnAttendance = comps.attendance ? parseInt(comps.attendance) : null;
            const espnWeather = event.weather ? event.weather.displayValue : (comps.weather ? comps.weather.displayValue : null);

            let shootout = null;
            const homeShootout = homeComp.shootoutScore !== undefined && homeComp.shootoutScore !== null ? parseInt(homeComp.shootoutScore) : null;
            const awayShootout = awayComp.shootoutScore !== undefined && awayComp.shootoutScore !== null ? parseInt(awayComp.shootoutScore) : null;
            if ((homeShootout !== null && !isNaN(homeShootout)) || (awayShootout !== null && !isNaN(awayShootout))) {
              shootout = {
                home: reversed ? awayShootout : homeShootout,
                away: reversed ? homeShootout : awayShootout
              };
            }

            const api_data = {
              venue: espnVenue,
              broadcasts: espnBroadcasts,
              clock: espnDisplayClock,
              scorers: scorers,
              red_cards: red_cards,
              yellow_cards: yellow_cards,
              referee: espnReferee,
              attendance: espnAttendance,
              weather: espnWeather,
              shootout: shootout
            };

            const currentReal = state.realResults[localMatch.id] || { goals1: null, goals2: null, status: 'scheduled' };

            if (currentReal.goals1 !== finalGoals1 || currentReal.goals2 !== finalGoals2 || currentReal.status !== status || JSON.stringify(currentReal.api_data) !== JSON.stringify(api_data)) {
              if (!state.realResults) state.realResults = {};
              state.realResults[localMatch.id] = {
                goals1: finalGoals1,
                goals2: finalGoals2,
                status: status,
                api_data: api_data
              };

              saveQueue.push({
                url: 'api.php?action=save_real_result',
                payload: {
                  match_id: localMatch.id,
                  goals1: finalGoals1,
                  goals2: finalGoals2,
                  status: status,
                  api_data: api_data
                },
                onSuccess: () => { updatedResultsCount++; }
              });
            }
          }
        });

        if (saveQueue.length === 0) {
          showToast("Todos los marcadores están al día con la API de ESPN.", "success");
          btn.prop('disabled', false).html('<i data-lucide="refresh-cw"></i> Sincronizar ESPN (En Vivo)');
          lucide.createIcons();
          return;
        }

        showToast(`Se detectaron ${saveQueue.length} cambios. Guardando resultados...`, "info");
        
        let successCount = 0;
        for (const item of saveQueue) {
          try {
            await new Promise((resolve, reject) => {
              $.ajax({
                url: item.url,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(item.payload),
                success: function(res) {
                  if (res && res.status === 'success') {
                    item.onSuccess();
                    successCount++;
                    resolve();
                  } else {
                    reject(res ? res.message : "Error desconocido");
                  }
                },
                error: function(xhr, st, err) {
                  reject(err);
                }
              });
            });
          } catch (err) {
            console.error(`[ESPN Sync Error] Falló al guardar:`, err);
          }
        }

        localStorage.setItem('quiniela_wc2026_state', JSON.stringify(state));

        renderDashboard();
        renderLeaderboard();
        renderAdminGrid();
        
        if ($('.tab-btn[data-target="#tab-analytics"]').hasClass('active')) {
          renderAnalyticsTab();
        }

        showToast(`Sincronización finalizada. Marcadores: ${updatedResultsCount}, Llaves: ${updatedTeamsCount}.`, "success");
        btn.prop('disabled', false).html('<i data-lucide="refresh-cw"></i> Sincronizar ESPN (En Vivo)');
        lucide.createIcons();
      },
      error: function(xhr, status, error) {
        showToast("Error al conectar con la API de ESPN.", "error");
        btn.prop('disabled', false).html('<i data-lucide="refresh-cw"></i> Sincronizar ESPN (En Vivo)');
        lucide.createIcons();
      }
    });
  }

  // ==========================================
  // 4. ACCIONES Y CONTROLADORES DE EVENTO
  // ==========================================

  $('#btn-add-player').on('click', function() {
    if (!isAdminMode) {
      showToast("Acceso Administrador requerido.", "error");
      return;
    }
    const nameInput = $('#new-player-name');
    const name = nameInput.val().trim();

    if (!name) {
      showToast("Ingresa un nombre válido.", "error");
      return;
    }

    const exists = state.players.some(p => p.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      showToast("Ya existe un jugador con este nombre.", "error");
      return;
    }

    const newPlayer = {
      id: String(Date.now()),
      name: name,
      predictions: {}
    };

    state.players.push(newPlayer);
    activePlayerId = newPlayer.id;

    saveState({ type: 'add-player', player: newPlayer });
    nameInput.val('');
    
    renderPlayersSelector();
    renderPredictionsGrid();
    renderDashboard();
    renderLeaderboard();

    const teams = getParticipatingTeams();
    renderChampionVotesGrid(teams);

    showToast(`Jugador "${name}" agregado exitosamente.`);
  });

  $('#new-player-name').on('keypress', function(e) {
    if (e.which === 13) {
      $('#btn-add-player').click();
    }
  });

  $('#btn-delete-player').on('click', function() {
    if (!isAdminMode) {
      showToast("Acceso Administrador requerido.", "error");
      return;
    }
    if (!activePlayerId) {
      showToast("No hay ningún jugador seleccionado para eliminar.", "error");
      return;
    }

    const player = state.players.find(p => p.id === activePlayerId);
    if (!player) return;

    if (confirm(`¿Estás seguro de que deseas eliminar al jugador "${player.name}" y todos sus pronósticos? Esta acción no se puede deshacer.`)) {
      state.players = state.players.filter(p => p.id !== activePlayerId);
      
      activePlayerId = null;

      saveState({ type: 'delete-player', playerId: player.id });

      renderPlayersSelector();
      renderPredictionsGrid();
      renderDashboard();
      renderLeaderboard();

      const teams = getParticipatingTeams();
      renderChampionVotesGrid(teams);

      showToast(`Jugador "${player.name}" eliminado.`);
    }
  });

  $('#btn-sync-espn').on('click', function(e) {
    e.preventDefault();
    syncWithESPN();
  });

  $('#btn-clear-real-results').on('click', function() {
    if (!isAdminMode) {
      showToast("Acceso Administrador requerido.", "error");
      return;
    }
    
    if (confirm("¿Estás seguro de que deseas limpiar TODOS los marcadores reales ingresados? Las clasificaciones volverán a cero.")) {
      if (typeof WORLD_CUP_2026_MATCHES !== 'undefined') {
        WORLD_CUP_2026_MATCHES.forEach(match => {
          state.realResults[match.id] = {
            goals1: null,
            goals2: null,
            status: 'scheduled'
          };
        });
      }

      saveState({ type: 'real-results', matchId: 'all' });

      renderDashboard();
      renderLeaderboard();
      renderAdminGrid();
      renderPredictionsGrid();
      
      showToast("Marcadores del torneo restablecidos.");
    }
  });

  $('#btn-save-pts-config').on('click', function() {
    if (!isAdminMode) {
      showToast("Acceso Administrador requerido.", "error");
      return;
    }

    const ptsExact = parseInt($('#pts-exact').val());
    const ptsWinner = parseInt($('#pts-winner').val());
    const ptsClosest = parseInt($('#pts-closest').val());
    const ptsChampion = parseInt($('#pts-champion').val());

    if (isNaN(ptsExact) || ptsExact < 0 || isNaN(ptsWinner) || ptsWinner < 0 || isNaN(ptsClosest) || ptsClosest < 0 || isNaN(ptsChampion) || ptsChampion < 0) {
      showToast("Ingresa valores de puntaje válidos (mayores o iguales a 0).", "error");
      return;
    }

    state.config.pointsExact = ptsExact;
    state.config.pointsWinner = ptsWinner;
    state.config.pointsClosest = ptsClosest;
    state.config.pointsChampion = ptsChampion;

    saveState({ type: 'config' });
    updateRulesPoints();
    renderDashboard();
    renderLeaderboard();
    if (activePlayerId) {
      renderPredictionsGrid();
    }

    const teams = getParticipatingTeams();
    renderChampionVotesGrid(teams);

    showToast("Configuración de puntos aplicada y clasificaciones recalculadas.");
  });

  $('#theme-toggle').on('click', function() {
    const currentTheme = $('html').attr('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    $('html').attr('data-theme', newTheme);
    state.config.theme = newTheme;
    saveState({ type: 'config' });

    if (newTheme === 'light') {
      $(this).html('<i data-lucide="moon"></i>');
    } else {
      $(this).html('<i data-lucide="sun"></i>');
    }
    lucide.createIcons();

    if ($('.tab-btn[data-target="#tab-analytics"]').hasClass('active')) {
      renderAnalyticsTab();
    }
  });

  $('#btn-force-reload').on('click', function(e) {
    e.preventDefault();
    window.location.href = window.location.pathname + '?r=' + Date.now();
  });

  // ==========================================
  // 5. EXPORTACIÓN A EXCEL (SHEETJS)
  // ==========================================

  function exportToExcel() {
    if (typeof XLSX === 'undefined') {
      showToast("Error: Librería de exportación no cargada.", "error");
      return;
    }

    const leaderboard = getPlayersLeaderboard();
    const wb = XLSX.utils.book_new();

    const boardData = leaderboard.map((p, idx) => ({
      "Posición": idx + 1,
      "Jugador": p.name,
      "Partidos Pronosticados": p.predictedCount,
      "Aciertos Exactos": p.exactHits,
      "Aciertos Cercanos (Consuelo)": p.closestHits,
      "Aciertos Ganador": p.winnerHits,
      "Incorrectos": p.incorrects,
      "Campeón Pronosticado": p.championPredictionText,
      "Puntos Totales": p.totalPoints
    }));
    
    const wsBoard = XLSX.utils.json_to_sheet(boardData);
    XLSX.utils.book_append_sheet(wb, wsBoard, "Clasificación General");

    const resultsData = WORLD_CUP_2026_MATCHES.map(match => {
      const real = state.realResults[match.id] || { goals1: null, goals2: null, status: 'scheduled' };
      const resolvedT1 = getTeamName(match.id, 1, match.team1);
      const resolvedT2 = getTeamName(match.id, 2, match.team2);
      const times = getFormattedMatchTimes(match.time);
      return {
        "ID Partido": match.id,
        "Fase/Jornada": match.round,
        "Grupo": match.group || "Eliminatorias",
        "Fecha": match.date,
        "Hora Original": times.original,
        "Hora El Salvador": times.sv,
        "Hora California": times.ca,
        "Equipo 1": resolvedT1,
        "Goles Equipo 1": real.goals1 !== null ? real.goals1 : "",
        "Goles Equipo 2": real.goals2 !== null ? real.goals2 : "",
        "Equipo 2": resolvedT2,
        "Sede": match.ground,
        "Estado": real.status === 'finished' ? 'Finalizado' : (real.status === 'live' ? 'En Vivo' : 'Pendiente')
      };
    });
    
    const wsResults = XLSX.utils.json_to_sheet(resultsData);
    XLSX.utils.book_append_sheet(wb, wsResults, "Resultados Reales");

    const matrixData = WORLD_CUP_2026_MATCHES.map(match => {
      const real = state.realResults[match.id] || { goals1: null, goals2: null, status: 'scheduled' };
      const resolvedT1 = getTeamName(match.id, 1, match.team1);
      const resolvedT2 = getTeamName(match.id, 2, match.team2);
      let realScore = "Pendiente";
      if (real.status === 'finished') {
        realScore = `${real.goals1} - ${real.goals2}`;
      }

      const rowObj = {
        "ID": match.id,
        "Jornada": match.round,
        "Grupo": match.group || "Eliminatorias",
        "Equipo 1": resolvedT1,
        "Equipo 2": resolvedT2,
        "Marcador Real": realScore
      };

      state.players.forEach(player => {
        const pred = player.predictions[match.id];
        if (pred && pred.goals1 !== null && pred.goals1 !== "" && pred.goals2 !== null && pred.goals2 !== "") {
          rowObj[player.name] = `${pred.goals1} - ${pred.goals2}`;
        } else {
          rowObj[player.name] = "-";
        }
      });

      return rowObj;
    });

    const wsMatrix = XLSX.utils.json_to_sheet(matrixData);
    XLSX.utils.book_append_sheet(wb, wsMatrix, "Matriz Pronósticos");

    XLSX.writeFile(wb, "Quiniela_Mundial_2026.xlsx");
    showToast("Archivo Excel descargado con éxito.");
  }

  $('#btn-export-excel, #btn-export-excel-board').on('click', exportToExcel);

  // ==========================================
  // 6. BACKUP Y RESPALDO (JSON)
  // ==========================================

  $('#btn-export-json').on('click', function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `quiniela_wc2026_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("Respaldo JSON descargado con éxito.");
  });

  $('#btn-trigger-import').on('click', function() {
    $('#import-json-file').click();
  });

  $('#import-json-file').on('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    $('#import-file-name-label').text(file.name);

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const imported = JSON.parse(evt.target.result);
        
        if (typeof imported !== 'object' || !imported.players || !imported.realResults) {
          showToast("Archivo JSON inválido. Estructura no compatible.", "error");
          return;
        }

        if (confirm("Se detectó un respaldo válido. ¿Deseas cargar este respaldo? Esto reemplazará todos los datos actuales del juego.")) {
          state = imported;
          syncOfficialMatches();
          saveState({ type: 'full-overwrite' });

          activePlayerId = null;

          renderDashboard();
          renderLeaderboard();
          renderPlayersSelector();
          if (activePlayerId) {
            renderPredictionsGrid();
          }
          renderAdminGrid();
          renderScheduleGrid();

          $('#pts-exact').val(state.config.pointsExact || 3);
          $('#pts-winner').val(state.config.pointsWinner || 1);
          $('#pts-closest').val(state.config.pointsClosest || 1);
          $('#pts-champion').val(state.config.pointsChampion || 10);
          updateRulesPoints();
          if (state.config.championVotingClosed === undefined) {
            state.config.championVotingClosed = false;
          }
          updateChampionVotingUI();
          
          const teams = getParticipatingTeams();
          populateChampionDropdowns(teams);
          renderChampionVotesGrid(teams);
          
          const theme = state.config.theme || 'dark';
          $('html').attr('data-theme', theme);
          if (theme === 'light') {
            $('#theme-toggle').html('<i data-lucide="moon"></i>');
          } else {
            $('#theme-toggle').html('<i data-lucide="sun"></i>');
          }
          lucide.createIcons();

          showToast("Respaldo cargado con éxito.");
        }
      } catch (err) {
        showToast("Error al procesar el archivo JSON.", "error");
        console.error(err);
      }
    };
    reader.readAsText(file);
  });

  $('#btn-reset-players').on('click', function() {
    if (!isAdminMode) {
      showToast("Acceso Administrador requerido.", "error");
      return;
    }

    if (confirm("¿Estás seguro de que deseas eliminar a TODOS los jugadores y sus predicciones? Los marcadores reales se mantendrán intactos.")) {
      state.players = [];
      activePlayerId = null;
      saveState({ type: 'reset-players' });

      renderDashboard();
      renderLeaderboard();
      renderPlayersSelector();
      renderPredictionsGrid();
      renderScheduleGrid();

      const teams = getParticipatingTeams();
      renderChampionVotesGrid(teams);

      showToast("Se eliminaron todos los jugadores.");
    }
  });

  $('#btn-reset-all').on('click', function() {
    if (!isAdminMode) {
      showToast("Acceso Administrador requerido.", "error");
      return;
    }

    if (confirm("ATENCIÓN: Se borrarán TODOS los datos de la quiniela (jugadores, pronósticos y marcadores reales del mundial) restableciendo todo al estado inicial. ¿Deseas continuar?")) {
      initializeDefaultState();
      syncOfficialMatches();
      saveState({ type: 'full-overwrite' });
      activePlayerId = null;

      renderDashboard();
      renderLeaderboard();
      renderPlayersSelector();
      renderPredictionsGrid();
      renderAdminGrid();
      renderScheduleGrid();

      $('#pts-exact').val(state.config.pointsExact);
      $('#pts-winner').val(state.config.pointsWinner);
      $('#pts-closest').val(state.config.pointsClosest);
      $('#pts-champion').val(state.config.pointsChampion);
      updateRulesPoints();
      updateChampionVotingUI();
      
      const teams = getParticipatingTeams();
      populateChampionDropdowns(teams);
      renderChampionVotesGrid(teams);
      
      $('html').attr('data-theme', 'dark');
      $('#theme-toggle').html('<i data-lucide="sun"></i>');
      lucide.createIcons();

      showToast("Quiniela restablecida por completo.");
    }
  });

  // ==========================================
  // 7. FILTROS Y EVENTOS DE CAMBIO
  // ==========================================

  $('#filter-group-pred, #filter-status-pred').on('change', function() {
    renderPredictionsGrid();
  });

  $('#filter-group-admin, #filter-status-admin').on('change', function() {
    renderAdminGrid();
  });

  $('#filter-group-schedule').on('change', function() {
    renderScheduleGrid();
  });

  $('#search-team-schedule').on('input', function() {
    renderScheduleGrid();
  });

  // Abrir modal al dar click en estadísticas de predicciones del calendario
  $(document).on('click', '.schedule-pred-stats', function() {
    const matchId = parseInt($(this).data('match-id'));
    if (!isNaN(matchId)) {
      openPredictionPlayersModal(matchId);
    }
  });

  // Cerrar modal de estadísticas de predicciones
  $(document).on('click', '#btn-pred-players-close', function() {
    closePredictionPlayersModal();
  });

  // Cerrar al dar click fuera del modal
  $(document).on('click', '#pred-players-modal', function(e) {
    if (e.target === this) {
      closePredictionPlayersModal();
    }
  });

  // Toggle de partidos anteriores en el calendario
  $(document).on('click', '#btn-toggle-past-matches', function() {
    const container = $('#past-matches-container');
    const icon = $('#toggle-past-icon');
    
    container.stop().slideToggle(250, function() {
      const isVisible = container.is(':visible');
      if (isVisible) {
        container.css('display', 'flex');
        icon.css('transform', 'rotate(180deg)');
      } else {
        icon.css('transform', 'rotate(0deg)');
      }
    });
  });

  // ==========================================
  // PREDICCIÓN DE CAMPEÓN DEL MUNDO (FUNCIONES)
  // ==========================================

  function getParticipatingTeams() {
    const teams = new Set();
    if (typeof WORLD_CUP_2026_MATCHES !== 'undefined') {
      WORLD_CUP_2026_MATCHES.forEach(match => {
        [match.team1, match.team2].forEach(team => {
          if (team) {
            const isPlaceholder = /^[0-9WLa-z\/]+$/.test(team) || 
                                  team.includes('/') || 
                                  /^[0-9]+[A-Z]$/i.test(team) || 
                                  /^RU?\d+$/i.test(team) || 
                                  /^W\d+$/i.test(team);
            if (!isPlaceholder) {
              teams.add(team);
            }
          }
        });
      });
    }
    return Array.from(teams).sort();
  }

  function populateChampionDropdowns(teams) {
    const adminSelect = $('#admin-select-champion');
    adminSelect.empty();
    adminSelect.append('<option value="">-- Sin Definir --</option>');
    teams.forEach(team => {
      adminSelect.append(`<option value="${team}">${team}</option>`);
    });
    adminSelect.val(state.realChampion || '');
  }

  function renderChampionVotesGrid(teams) {
    const noPlayersDiv = $('#champion-no-players');
    const tableContainer = $('#champion-table-container');
    const tbody = $('#champion-votes-tbody');
    
    tbody.empty();
    
    // Actualizar el banner del campeón oficial en la pestaña de votación
    const championOfficialNameDiv = $('#champion-official-name');
    if (state.realChampion) {
      const flagHTML = getTeamFlagHTML(state.realChampion);
      championOfficialNameDiv.html(`
        <div style="display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 700; color: var(--primary); margin-top: 0.25rem;">
          <div style="width: 30px; display: flex; align-items: center; justify-content: center;">
            ${flagHTML}
          </div>
          <span>${state.realChampion}</span>
        </div>
      `);
    } else {
      championOfficialNameDiv.html(`
        <span style="color: var(--text-muted);">Pendiente de definición (se definirá por el Administrador al terminar el torneo)</span>
      `);
    }
    
    if (!state.players || state.players.length === 0) {
      noPlayersDiv.show();
      tableContainer.hide();
      return;
    }
    
    noPlayersDiv.hide();
    tableContainer.show();
    
    state.players.forEach(player => {
      let optionsHTML = '<option value="">-- Seleccionar --</option>';
      teams.forEach(team => {
        const selected = player.championPrediction === team ? 'selected' : '';
        optionsHTML += `<option value="${team}" ${selected}>${team}</option>`;
      });
      
      const flagHTML = player.championPrediction ? getTeamFlagHTML(player.championPrediction) : `<div class="team-flag-placeholder"><i data-lucide="help-circle" style="width: 13px; height: 13px; opacity:0.6;"></i></div>`;
      
      let statusText = 'Pendiente';
      let statusStyle = 'background: rgba(251, 191, 36, 0.1); color: var(--secondary); border: 1px solid rgba(251, 191, 36, 0.25);';
      let ptsText = '0 pts';
      
      const points = state.config.pointsChampion !== undefined ? state.config.pointsChampion : 10;
      
      if (state.realChampion) {
        if (player.championPrediction === state.realChampion) {
          statusText = 'Acertado';
          statusStyle = 'background: rgba(16, 185, 129, 0.1); color: var(--primary); border: 1px solid rgba(16, 185, 129, 0.25);';
          ptsText = `+${points} pts`;
        } else {
          statusText = 'Fallo';
          statusStyle = 'background: rgba(244, 63, 94, 0.1); color: var(--danger); border: 1px solid rgba(244, 63, 94, 0.25);';
          ptsText = '0 pts';
        }
      } else if (!player.championPrediction) {
        statusText = 'Sin Voto';
        statusStyle = 'background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid rgba(255, 255, 255, 0.05);';
      }
      
      let disabledSelectAttr = '';
      if (state.config.championVotingClosed && !isAdminMode) {
        disabledSelectAttr = 'disabled';
      }

      const selectHtml = `
        <div style="display: flex; align-items: center; gap: 0.8rem;">
          <div class="champion-flag-container" id="flag-champion-${player.id}" style="width: 40px; display: flex; align-items: center; justify-content: center;">
            ${flagHTML}
          </div>
          <select class="select-custom champion-vote-select" data-player-id="${player.id}" style="min-width: 180px;" ${disabledSelectAttr}>
            ${optionsHTML}
          </select>
        </div>
      `;
      
      tbody.append(`
        <tr>
          <td style="font-weight: 600; font-family: 'Outfit'; vertical-align: middle;">${player.name}</td>
          <td style="vertical-align: middle;">${selectHtml}</td>
          <td style="text-align: center; vertical-align: middle;">
            <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 0.2rem;">
              <span class="match-status-badge" style="${statusStyle} padding: 0.2rem 0.5rem; border-radius: var(--border-radius-sm); font-weight: 700; font-size: 0.7rem; text-transform: uppercase;">
                ${statusText}
              </span>
              <span style="font-size: 0.8rem; font-weight: 600; color: ${statusText === 'Acertado' ? 'var(--primary)' : 'var(--text-secondary)'};">
                ${ptsText}
              </span>
            </div>
          </td>
        </tr>
      `);
    });
    
    $('.champion-vote-select').off('change').on('change', function() {
      const playerId = $(this).data('player-id');
      const val = $(this).val();
      
      const player = state.players.find(p => p.id == playerId);
      if (player) {
        player.championPrediction = val || null;
        saveState({ type: 'champion-vote', playerId: playerId });
        
        const flagContainer = $(`#flag-champion-${playerId}`);
        if (val) {
          flagContainer.html(getTeamFlagHTML(val));
        } else {
          flagContainer.html(`<div class="team-flag-placeholder"><i data-lucide="help-circle" style="width: 13px; height: 13px; opacity:0.6;"></i></div>`);
        }
        
        renderChampionVotesGrid(teams);
        renderLeaderboard();
        
        showToast("Voto guardado y clasificaciones actualizadas.");
        lucide.createIcons();
      }
    });
    
    lucide.createIcons();
  }

  function updateChampionVotingUI() {
    const isClosed = !!(state.config && state.config.championVotingClosed);
    const btn = $('#btn-toggle-champion-voting');
    
    if (isClosed) {
      btn.removeClass('btn-secondary').addClass('btn-primary')
         .html('<i data-lucide="lock-open"></i> Abrir Votaciones');
      $('#champion-closed-banner').show();
    } else {
      btn.removeClass('btn-primary').addClass('btn-secondary')
         .html('<i data-lucide="lock"></i> Cerrar Votaciones');
      $('#champion-closed-banner').hide();
    }
    
    lucide.createIcons();
  }

  $('#btn-toggle-champion-voting').on('click', function() {
    if (!isAdminMode) {
      showToast("Acceso Administrador requerido.", "error");
      return;
    }
    
    state.config.championVotingClosed = !state.config.championVotingClosed;
    saveState({ type: 'config' });
    
    updateChampionVotingUI();
    
    const teams = getParticipatingTeams();
    renderChampionVotesGrid(teams);
    
    const toastMsg = state.config.championVotingClosed ? "Votaciones del campeón cerradas con éxito." : "Votaciones del campeón abiertas con éxito.";
    showToast(toastMsg);
  });

  $('#btn-save-champion').on('click', function() {
    if (!isAdminMode) {
      showToast("Acceso Administrador requerido.", "error");
      return;
    }
    
    const selectedChampion = $('#admin-select-champion').val();
    state.realChampion = selectedChampion || null;
    
    saveState({ type: 'real-champion' });
    renderDashboard();
    renderLeaderboard();
    
    const teams = getParticipatingTeams();
    renderChampionVotesGrid(teams);
    
    showToast("Campeón oficial del Mundial guardado. Tabla de posiciones recalculada.");
  });

  // ==========================================
  // 7.4. CONFIGURACIÓN DILIGENTE DE LA BASE DE DATOS (MYSQL)
  // ==========================================

  function loadDbConfig() {
    $.ajax({
      url: 'api.php?action=get_db_config',
      type: 'GET',
      dataType: 'json',
      cache: false,
      success: function(res) {
        if (res && res.status === 'success') {
          $('#db-config-host').val(res.db_host || '');
          $('#db-config-name').val(res.db_name || '');
          $('#db-config-user').val(res.db_user || '');
          $('#db-config-pass').val(''); // Dejar vacío por seguridad
          
          dbConnected = res.db_connected;
          
          const banner = $('#db-status-banner');
          banner.empty();
          
          if (dbConnected) {
            banner.css({
              'background': 'rgba(16, 185, 129, 0.08)',
              'border': '1px solid rgba(16, 185, 129, 0.15)',
              'color': 'var(--primary)'
            }).html('<i data-lucide="check-circle" style="width: 16px; height: 16px;"></i> Conectado a la base de datos MySQL.');
          } else {
            banner.css({
              'background': 'rgba(244, 63, 94, 0.08)',
              'border': '1px solid rgba(244, 63, 94, 0.15)',
              'color': 'var(--danger)'
            }).html(`<i data-lucide="alert-circle" style="width: 16px; height: 16px;"></i> Desconectado. Error: ${res.conn_error || 'Desconocido'}`);
          }
          lucide.createIcons();
          updateAdminUI(); // Actualizar bloqueos según el estado de conexión
        }
      },
      error: function(xhr, status, error) {
        console.error("Error al obtener la configuración de BD:", error);
        dbConnected = false;
        const banner = $('#db-status-banner');
        if (banner.length) {
          banner.css({
            'background': 'rgba(244, 63, 94, 0.08)',
            'border': '1px solid rgba(244, 63, 94, 0.15)',
            'color': 'var(--danger)'
          }).html(`<i data-lucide="x-circle" style="width: 16px; height: 16px;"></i> Error de red al cargar configuración.`);
          lucide.createIcons();
        }
        updateAdminUI();
      }
    });
  }

  function saveDbConfig() {
    const host = $('#db-config-host').val().trim();
    const name = $('#db-config-name').val().trim();
    const user = $('#db-config-user').val().trim();
    const pass = $('#db-config-pass').val();
    
    if (!host || !name || !user) {
      showToast("Por favor, completa los campos de Host, Nombre de BD y Usuario.", "error");
      return;
    }
    
    const payload = {
      db_host: host,
      db_name: name,
      db_user: user,
      db_pass: pass
    };
    
    // Si ya está conectada, requerir PIN de administrador
    if (dbConnected) {
      payload.admin_pin = state.config.adminPin || '1234';
    }
    
    showToast("Guardando y probando conexión...", "info");
    
    $.ajax({
      url: 'api.php?action=save_db_config',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload),
      dataType: 'json',
      success: function(res) {
        if (res && res.status === 'success') {
          showToast(res.message, "success");
          loadDbConfig();
          // Recargar el estado general desde la nueva BD
          loadState(function() {
            renderDashboard();
            renderLeaderboard();
            renderAdminGrid();
            renderScheduleGrid();
            if (activePlayerId) {
              renderPredictionsGrid();
            }
          });
        } else if (res && res.status === 'warning') {
          showToast(res.message, "warning");
          loadDbConfig();
        } else {
          showToast(res.message || "Error al guardar la configuración.", "error");
        }
      },
      error: function(xhr, status, error) {
        showToast("Error de conexión al guardar: " + error, "error");
      }
    });
  }

  // ==========================================
  // 7.5. ESTADÍSTICAS Y GRÁFICOS (CHART.JS)
  // ==========================================

  function getThemeColor(variableName, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    return value || fallback;
  }

  function hexOrRgbToRgba(colorStr, opacity) {
    if (!colorStr) return `rgba(0, 0, 0, ${opacity})`;
    colorStr = colorStr.trim();
    if (colorStr.startsWith('rgb')) {
      // If it's already rgb(r, g, b) or rgba(r, g, b, a)
      return colorStr.replace(/rgb\(/, 'rgba(').replace(/\)/, `, ${opacity})`).replace(/rgba\(([^)]+),\s*[^)]+\)/, `rgba($1, ${opacity})`);
    }
    if (colorStr.startsWith('#')) {
      let hex = colorStr.slice(1);
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return colorStr;
  }

  function initAnalyticsTab() {
    $('#stats-match-select').off('change').on('change', function() {
      const matchId = parseInt($(this).val());
      renderMatchSpecificAnalytics(matchId);
    });
  }

  function renderAnalyticsTab() {
    if (typeof Chart === 'undefined') {
      $('#stats-no-players-placeholder').html(`
        <i data-lucide="wifi-off" style="width: 48px; height: 48px; color: var(--danger); margin-bottom: 1rem;"></i>
        <h3>Error al cargar gráficos</h3>
        <p style="margin-top: 0.5rem; font-size: 0.9rem;">Chart.js no está disponible. Por favor, verifica tu conexión a internet.</p>
      `).show();
      $('#stats-match-details').hide();
      
      // Vaciar contadores
      $('#stats-total-players').text(state.players.length);
      $('#stats-total-predictions').text(0);
      $('#stats-participation-rate').text('0%');
      $('#stats-most-common-score').text('-');
      
      lucide.createIcons();
      return;
    }

    const totalPlayers = state.players.length;

    // Colores del tema actual
    const textColor = getThemeColor('--text-secondary', '#94a3b8');
    const labelColor = getThemeColor('--text-primary', '#f8fafc');
    const primaryColor = getThemeColor('--primary', '#10b981');
    const secondaryColor = getThemeColor('--secondary', '#fbbf24');
    const gridColor = getThemeColor('--border-color', 'rgba(255, 255, 255, 0.05)');

    // 1. Mostrar/Ocultar placeholder según si hay jugadores
    if (totalPlayers === 0) {
      $('#stats-no-players-placeholder').html(`
        <i data-lucide="users" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 1rem;"></i>
        <h3>No hay jugadores registrados</h3>
        <p style="margin-top: 0.5rem; font-size: 0.9rem;">Registra jugadores para ver el análisis de estadísticas de predicciones.</p>
      `).show();
      $('#stats-match-details').hide();
      
      // Vaciar contadores
      $('#stats-total-players').text(0);
      $('#stats-total-predictions').text(0);
      $('#stats-participation-rate').text('0%');
      $('#stats-most-common-score').text('-');
      
      // Destruir gráficos anteriores de predicciones si existen
      if (chartChampionVotes) { chartChampionVotes.destroy(); chartChampionVotes = null; }
      if (chartTeamPopularity) { chartTeamPopularity.destroy(); chartTeamPopularity = null; }
      if (chartMatchDistribution) { chartMatchDistribution.destroy(); chartMatchDistribution = null; }
    } else {
      $('#stats-no-players-placeholder').hide();
      $('#stats-match-details').show();

      // 2. Calcular Métricas Generales
      let totalPredictions = 0;
      const scoreCounts = {};
      
      state.players.forEach(p => {
        Object.values(p.predictions).forEach(pred => {
          if (pred.goals1 !== null && pred.goals1 !== undefined && pred.goals1 !== "" &&
              pred.goals2 !== null && pred.goals2 !== undefined && pred.goals2 !== "") {
            totalPredictions++;
            const scoreKey = `${pred.goals1} - ${pred.goals2}`;
            scoreCounts[scoreKey] = (scoreCounts[scoreKey] || 0) + 1;
          }
        });
      });

      const possiblePredictions = totalPlayers * 104;
      const participationRate = possiblePredictions > 0 ? ((totalPredictions / possiblePredictions) * 100).toFixed(1) + '%' : '0%';

      let mostCommonScore = "-";
      let maxCount = 0;
      Object.entries(scoreCounts).forEach(([score, count]) => {
        if (count > maxCount) {
          maxCount = count;
          mostCommonScore = `${score} (${count} ${count === 1 ? 'voto' : 'votos'})`;
        }
      });

      $('#stats-total-players').text(totalPlayers);
      $('#stats-total-predictions').text(totalPredictions);
      $('#stats-participation-rate').text(participationRate);
      $('#stats-most-common-score').text(mostCommonScore);

      // 4. Gráfico de Campeones Favoritos
      const championCounts = {};
      state.players.forEach(p => {
        if (p.championPrediction) {
          championCounts[p.championPrediction] = (championCounts[p.championPrediction] || 0) + 1;
        }
      });

      const championSorted = Object.entries(championCounts)
        .sort((a, b) => b[1] - a[1]);

      const championLabels = championSorted.map(item => item[0]);
      const championData = championSorted.map(item => item[1]);

      if (chartChampionVotes) {
        chartChampionVotes.destroy();
      }

      const ctxChampion = document.getElementById('chart-champion-votes');
      if (ctxChampion) {
        chartChampionVotes = new Chart(ctxChampion, {
          type: 'bar',
          data: {
            labels: championLabels,
            datasets: [{
              label: 'Votos',
              data: championData,
              backgroundColor: hexOrRgbToRgba(primaryColor, 0.75),
              borderColor: primaryColor,
              borderWidth: 1,
              borderRadius: 4
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: gridColor,
                borderWidth: 1
              }
            },
            scales: {
              x: {
                beginAtZero: true,
                ticks: {
                  stepSize: 1,
                  color: textColor
                },
                grid: {
                  color: gridColor
                }
              },
              y: {
                ticks: {
                  color: labelColor,
                  font: {
                    family: 'system-ui, -apple-system, sans-serif'
                  }
                },
                grid: {
                  display: false
                }
              }
            }
          }
        });
      }

      // 5. Gráfico de Popularidad de Equipos (Victorias acumuladas)
      const teamWinsCounts = {};
      state.players.forEach(p => {
        WORLD_CUP_2026_MATCHES.forEach(match => {
          const pred = p.predictions[match.id];
          if (pred && pred.goals1 !== null && pred.goals1 !== undefined && pred.goals1 !== "" &&
              pred.goals2 !== null && pred.goals2 !== undefined && pred.goals2 !== "") {
            const g1 = parseInt(pred.goals1);
            const g2 = parseInt(pred.goals2);
            if (g1 > g2) {
              const team1 = getTeamName(match.id, 1, match.team1);
              teamWinsCounts[team1] = (teamWinsCounts[team1] || 0) + 1;
            } else if (g1 < g2) {
              const team2 = getTeamName(match.id, 2, match.team2);
              teamWinsCounts[team2] = (teamWinsCounts[team2] || 0) + 1;
            }
          }
        });
      });

      const popularTeamsSorted = Object.entries(teamWinsCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const popularityLabels = popularTeamsSorted.map(item => item[0]);
      const popularityData = popularTeamsSorted.map(item => item[1]);

      if (chartTeamPopularity) {
        chartTeamPopularity.destroy();
      }

      const ctxPopularity = document.getElementById('chart-team-popularity');
      if (ctxPopularity) {
        chartTeamPopularity = new Chart(ctxPopularity, {
          type: 'bar',
          data: {
            labels: popularityLabels,
            datasets: [{
              label: 'Victorias Pronosticadas',
              data: popularityData,
              backgroundColor: hexOrRgbToRgba(secondaryColor, 0.75),
              borderColor: secondaryColor,
              borderWidth: 1,
              borderRadius: 4
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: gridColor,
                borderWidth: 1
              }
            },
            scales: {
              x: {
                beginAtZero: true,
                ticks: {
                  stepSize: 1,
                  color: textColor
                },
                grid: {
                  color: gridColor
                }
              },
              y: {
                ticks: {
                  color: labelColor,
                  font: {
                    family: 'system-ui, -apple-system, sans-serif'
                  }
                },
                grid: {
                  display: false
                }
              }
            }
          }
        });
      }

      // 6. Rellenar y Sincronizar el Selector de Partidos
      const select = $('#stats-match-select');
      const currentVal = select.val();
      
      select.empty();
      WORLD_CUP_2026_MATCHES.forEach(match => {
        const t1 = getTeamName(match.id, 1, match.team1);
        const t2 = getTeamName(match.id, 2, match.team2);
        select.append(`<option value="${match.id}">Partido ${match.id}: ${t1} vs ${t2} (${match.date})</option>`);
      });

      if (currentVal && select.find(`option[value="${currentVal}"]`).length > 0) {
        select.val(currentVal);
        renderMatchSpecificAnalytics(parseInt(currentVal));
      } else {
        select.val(1);
        renderMatchSpecificAnalytics(1);
      }
    }

    // ==========================================
    // ESTADÍSTICAS REALES DEL TORNEO
    // ==========================================

    const scorersCount = {};
    const minutesCount = {
      "1' - 15'": 0,
      "16' - 30'": 0,
      "31' - 45'": 0,
      "46' - 60'": 0,
      "61' - 75'": 0,
      "76' - 90'": 0,
      "Extra Tiempo": 0
    };
    const teamCardsCount = {};

    function getMinuteInterval(minStr) {
      if (!minStr) return null;
      const cleaned = minStr.replace(/[^0-9+]/g, '');
      const parts = cleaned.split('+');
      const baseMin = parseInt(parts[0]);
      if (isNaN(baseMin)) return null;
      
      if (baseMin > 90) return "Extra Tiempo";
      if (baseMin <= 15) return "1' - 15'";
      if (baseMin <= 30) return "16' - 30'";
      if (baseMin <= 45) return "31' - 45'";
      if (baseMin <= 60) return "46' - 60'";
      if (baseMin <= 75) return "61' - 75'";
      if (baseMin <= 90) return "76' - 90'";
      return "Extra Tiempo";
    }

    let hasRealStatsData = false;

    if (state.realResults) {
      Object.keys(state.realResults).forEach(matchId => {
        const real = state.realResults[matchId];
        const match = WORLD_CUP_2026_MATCHES.find(m => m.id === parseInt(matchId));
        if (!real || !real.api_data || !match) return;

        const apiData = real.api_data;
        const team1 = getTeamName(match.id, 1, match.team1);
        const team2 = getTeamName(match.id, 2, match.team2);

        // Agrupar Goleadores
        if (apiData.scorers) {
          if (Array.isArray(apiData.scorers.home)) {
            apiData.scorers.home.forEach(s => {
              if (s.player) {
                const name = s.player.trim();
                if (name) {
                  scorersCount[name] = (scorersCount[name] || 0) + 1;
                  hasRealStatsData = true;
                }
              }
              if (s.minute) {
                const interval = getMinuteInterval(s.minute);
                if (interval) minutesCount[interval]++;
              }
            });
          }
          if (Array.isArray(apiData.scorers.away)) {
            apiData.scorers.away.forEach(s => {
              if (s.player) {
                const name = s.player.trim();
                if (name) {
                  scorersCount[name] = (scorersCount[name] || 0) + 1;
                  hasRealStatsData = true;
                }
              }
              if (s.minute) {
                const interval = getMinuteInterval(s.minute);
                if (interval) minutesCount[interval]++;
              }
            });
          }
        }

        // Agrupar Tarjetas
        if (!teamCardsCount[team1]) teamCardsCount[team1] = { yellow: 0, red: 0 };
        if (!teamCardsCount[team2]) teamCardsCount[team2] = { yellow: 0, red: 0 };

        if (apiData.yellow_cards) {
          if (Array.isArray(apiData.yellow_cards.home)) {
            teamCardsCount[team1].yellow += apiData.yellow_cards.home.length;
            if (apiData.yellow_cards.home.length > 0) hasRealStatsData = true;
          }
          if (Array.isArray(apiData.yellow_cards.away)) {
            teamCardsCount[team2].yellow += apiData.yellow_cards.away.length;
            if (apiData.yellow_cards.away.length > 0) hasRealStatsData = true;
          }
        }

        if (apiData.red_cards) {
          if (Array.isArray(apiData.red_cards.home)) {
            teamCardsCount[team1].red += apiData.red_cards.home.length;
            if (apiData.red_cards.home.length > 0) hasRealStatsData = true;
          }
          if (Array.isArray(apiData.red_cards.away)) {
            teamCardsCount[team2].red += apiData.red_cards.away.length;
            if (apiData.red_cards.away.length > 0) hasRealStatsData = true;
          }
        }
      });
    }

    if (!hasRealStatsData) {
      $('#container-top-scorers').hide();
      $('#placeholder-top-scorers').show();

      $('#container-goals-by-minute').hide();
      $('#placeholder-goals-by-minute').show();

      $('#container-team-cards').hide();
      $('#placeholder-team-cards').css('display', 'flex');

      if (chartTopScorers) { chartTopScorers.destroy(); chartTopScorers = null; }
      if (chartGoalsByMinute) { chartGoalsByMinute.destroy(); chartGoalsByMinute = null; }
      if (chartTeamCards) { chartTeamCards.destroy(); chartTeamCards = null; }
    } else {
      $('#container-top-scorers').show();
      $('#placeholder-top-scorers').hide();

      $('#container-goals-by-minute').show();
      $('#placeholder-goals-by-minute').hide();

      $('#container-team-cards').show();
      $('#placeholder-team-cards').hide();

      // A. Máximos Goleadores (Top 10)
      const sortedScorers = Object.entries(scorersCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      const scorersLabels = sortedScorers.map(item => item[0]);
      const scorersData = sortedScorers.map(item => item[1]);

      if (chartTopScorers) {
        chartTopScorers.destroy();
      }

      const ctxScorers = document.getElementById('chart-top-scorers');
      if (ctxScorers) {
        chartTopScorers = new Chart(ctxScorers, {
          type: 'bar',
          data: {
            labels: scorersLabels,
            datasets: [{
              label: 'Goles',
              data: scorersData,
              backgroundColor: hexOrRgbToRgba(primaryColor, 0.75),
              borderColor: primaryColor,
              borderWidth: 1,
              borderRadius: 4
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: gridColor,
                borderWidth: 1
              }
            },
            scales: {
              x: {
                beginAtZero: true,
                ticks: { stepSize: 1, color: textColor },
                grid: { color: gridColor }
              },
              y: {
                ticks: {
                  color: labelColor,
                  font: { family: 'system-ui, -apple-system, sans-serif' }
                },
                grid: { display: false }
              }
            }
          }
        });
      }

      // B. Distribución de Goles por Minuto
      const infoColor = getThemeColor('--info', '#0ea5e9');
      const minLabels = ["1' - 15'", "16' - 30'", "31' - 45'", "46' - 60'", "61' - 75'", "76' - 90'", "Extra Tiempo"];
      const minData = minLabels.map(lbl => minutesCount[lbl]);

      if (chartGoalsByMinute) {
        chartGoalsByMinute.destroy();
      }

      const ctxGoalsMin = document.getElementById('chart-goals-by-minute');
      if (ctxGoalsMin) {
        chartGoalsByMinute = new Chart(ctxGoalsMin, {
          type: 'bar',
          data: {
            labels: minLabels,
            datasets: [{
              label: 'Goles',
              data: minData,
              backgroundColor: hexOrRgbToRgba(infoColor, 0.75),
              borderColor: infoColor,
              borderWidth: 1,
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: gridColor,
                borderWidth: 1
              }
            },
            scales: {
              x: {
                ticks: { color: labelColor },
                grid: { display: false }
              },
              y: {
                beginAtZero: true,
                ticks: { stepSize: 1, color: textColor },
                grid: { color: gridColor }
              }
            }
          }
        });
      }

      // C. Equipos Más Sancionados (Top 10)
      const sortedTeamsCards = Object.entries(teamCardsCount)
        .map(([team, cards]) => ({
          team,
          yellow: cards.yellow,
          red: cards.red,
          points: (cards.red * 3) + cards.yellow
        }))
        .filter(t => t.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, 10);

      const teamLabels = sortedTeamsCards.map(item => item.team);
      const yellowData = sortedTeamsCards.map(item => item.yellow);
      const redData = sortedTeamsCards.map(item => item.red);

      if (chartTeamCards) {
        chartTeamCards.destroy();
      }

      const ctxTeamCards = document.getElementById('chart-team-cards');
      if (ctxTeamCards) {
        chartTeamCards = new Chart(ctxTeamCards, {
          type: 'bar',
          data: {
            labels: teamLabels,
            datasets: [
              {
                label: 'Tarjetas Amarillas',
                data: yellowData,
                backgroundColor: 'rgba(251, 191, 36, 0.75)', // yellow
                borderColor: '#fbbf24',
                borderWidth: 1,
                borderRadius: 4
              },
              {
                label: 'Tarjetas Rojas',
                data: redData,
                backgroundColor: 'rgba(239, 68, 68, 0.75)', // red
                borderColor: '#ef4444',
                borderWidth: 1,
                borderRadius: 4
              }
            ]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                labels: { color: labelColor }
              },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: gridColor,
                borderWidth: 1
              }
            },
            scales: {
              x: {
                stacked: true,
                beginAtZero: true,
                ticks: { stepSize: 1, color: textColor },
                grid: { color: gridColor }
              },
              y: {
                stacked: true,
                ticks: {
                  color: labelColor,
                  font: { family: 'system-ui, -apple-system, sans-serif' }
                },
                grid: { display: false }
              }
            }
          }
        });
      }
    }

    lucide.createIcons();
  }

  function renderMatchSpecificAnalytics(matchId) {
    const match = WORLD_CUP_2026_MATCHES.find(m => m.id === matchId);
    if (!match) return;

    const resolvedTeam1 = getTeamName(match.id, 1, match.team1);
    const resolvedTeam2 = getTeamName(match.id, 2, match.team2);

    const flag1HTML = getTeamFlagHTML(resolvedTeam1);
    const flag2HTML = getTeamFlagHTML(resolvedTeam2);
    
    const times = getFormattedMatchTimes(match.time);
    const real = state.realResults[match.id];
    let scoreDisplay = "vs";
    if (real && real.goals1 !== null && real.goals1 !== undefined && real.goals2 !== null && real.goals2 !== undefined) {
      scoreDisplay = `<span style="font-size: 1.5rem; font-weight: 800; color: var(--primary);">${real.goals1} - ${real.goals2}</span>`;
    }

    const previewHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: center;">
        <div style="display: flex; justify-content: space-between; width: 100%; font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
          <span>${match.round} ${match.group ? `• ${match.group}` : ''}</span>
          <span style="text-align: right;">
            ${match.date} &bull; ${times.original}<br>
            <span style="color: var(--primary); font-weight: 600;">SV: ${times.sv}</span> &bull; 
            <span style="color: var(--secondary); font-weight: 600;">CA: ${times.ca}</span>
          </span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-around; width: 100%; gap: 1rem;">
          <div style="display: flex; flex-direction: column; align-items: center; flex: 1; text-align: center; gap: 0.25rem;">
            <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; transform: scale(1.2);">
              ${flag1HTML}
            </div>
            <span style="font-weight: 700; color: var(--text-primary); margin-top: 0.25rem; font-size: 0.95rem;">${resolvedTeam1}</span>
          </div>
          
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 60px;">
            ${scoreDisplay}
            ${real && real.status === 'finished' ? `<span style="font-size: 0.65rem; background: var(--border-color); padding: 0.05rem 0.3rem; border-radius: var(--border-radius-sm); color: var(--text-secondary); margin-top: 0.2rem;">Finalizado</span>` : ''}
            ${real && real.status === 'live' ? `<span style="font-size: 0.65rem; background: rgba(14, 165, 233, 0.15); color: var(--info); padding: 0.05rem 0.3rem; border-radius: var(--border-radius-sm); font-weight: 700; margin-top: 0.2rem;">En Vivo</span>` : ''}
          </div>
          
          <div style="display: flex; flex-direction: column; align-items: center; flex: 1; text-align: center; gap: 0.25rem;">
            <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; transform: scale(1.2);">
              ${flag2HTML}
            </div>
            <span style="font-weight: 700; color: var(--text-primary); margin-top: 0.25rem; font-size: 0.95rem;">${resolvedTeam2}</span>
          </div>
        </div>
      </div>
    `;
    
    $('#stats-match-card-preview').html(previewHTML);

    // Calcular predicciones para este partido
    let votesCast = 0;
    let win1 = 0;
    let draw = 0;
    let win2 = 0;
    let totalGoals1 = 0;
    let totalGoals2 = 0;
    const matchScores = {};

    state.players.forEach(p => {
      const pred = p.predictions[match.id];
      if (pred && pred.goals1 !== null && pred.goals1 !== undefined && pred.goals1 !== "" &&
          pred.goals2 !== null && pred.goals2 !== undefined && pred.goals2 !== "") {
        votesCast++;
        const g1 = parseInt(pred.goals1);
        const g2 = parseInt(pred.goals2);
        
        totalGoals1 += g1;
        totalGoals2 += g2;
        
        if (g1 > g2) {
          win1++;
        } else if (g1 < g2) {
          win2++;
        } else {
          draw++;
        }
        
        const scoreKey = `${g1} - ${g2}`;
        matchScores[scoreKey] = (matchScores[scoreKey] || 0) + 1;
      }
    });

    const totalPlayers = state.players.length;
    $('#stats-match-votes-cast').text(`${votesCast} de ${totalPlayers}`);

    // Goles Promedio
    const avgGoals1 = votesCast > 0 ? (totalGoals1 / votesCast).toFixed(1) : "0.0";
    const avgGoals2 = votesCast > 0 ? (totalGoals2 / votesCast).toFixed(1) : "0.0";
    
    $('#stats-match-average-goals').html(`
      <div style="text-align: center;">
        <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Goles Prom. ${resolvedTeam1}</span>
        <strong style="font-size: 1.1rem; color: var(--text-primary);">${avgGoals1}</strong>
      </div>
      <div style="text-align: center; border-left: 1px solid var(--border-color); height: 30px; margin: auto 0;"></div>
      <div style="text-align: center;">
        <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Goles Prom. ${resolvedTeam2}</span>
        <strong style="font-size: 1.1rem; color: var(--text-primary);">${avgGoals2}</strong>
      </div>
    `);

    // Marcadores Más Populares (Top 3)
    const sortedMatchScores = Object.entries(matchScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const popularScoresContainer = $('#stats-match-popular-scores');
    popularScoresContainer.empty();

    if (sortedMatchScores.length === 0) {
      popularScoresContainer.html('<span style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">Sin pronósticos registrados aún.</span>');
    } else {
      sortedMatchScores.forEach(([score, count]) => {
        const pct = votesCast > 0 ? ((count / votesCast) * 100).toFixed(0) : "0";
        popularScoresContainer.append(`
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-secondary);">
            <span>Marcador <strong>${score}</strong></span>
            <span>${count} ${count === 1 ? 'voto' : 'votos'} (${pct}%)</span>
          </div>
        `);
      });
    }

    // Dibujar Doughnut
    const primaryColor = getThemeColor('--primary', '#10b981');
    const secondaryColor = getThemeColor('--secondary', '#fbbf24');
    const accentColor = getThemeColor('--accent', '#6366f1');
    const gridColor = getThemeColor('--border-color', 'rgba(255, 255, 255, 0.05)');

    let dataLabels = [`Gana ${resolvedTeam1}`, 'Empate', `Gana ${resolvedTeam2}`];
    let dataValues = [win1, draw, win2];
    let dataColors = [hexOrRgbToRgba(primaryColor, 0.75), hexOrRgbToRgba(accentColor, 0.75), hexOrRgbToRgba(secondaryColor, 0.75)];
    let borderColors = [primaryColor, accentColor, secondaryColor];

    if (votesCast === 0) {
      dataLabels = ['Sin pronósticos'];
      dataValues = [1];
      dataColors = ['rgba(148, 163, 184, 0.15)'];
      borderColors = ['rgb(148, 163, 184)'];
    }

    if (chartMatchDistribution) {
      chartMatchDistribution.destroy();
    }

    const ctxMatch = document.getElementById('chart-match-distribution');
    if (ctxMatch) {
      chartMatchDistribution = new Chart(ctxMatch, {
        type: 'doughnut',
        data: {
          labels: dataLabels,
          datasets: [{
            data: dataValues,
            backgroundColor: dataColors,
            borderColor: borderColors,
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              enabled: votesCast > 0,
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              titleColor: '#fff',
              bodyColor: '#fff',
              borderColor: gridColor,
              borderWidth: 1,
              callbacks: {
                label: function(context) {
                  const val = context.raw;
                  const pct = votesCast > 0 ? ((val / votesCast) * 100).toFixed(1) : "0";
                  return ` ${context.label}: ${val} (${pct}%)`;
                }
              }
            }
          },
          cutout: '65%'
        }
      });
    }
  }

  // ==========================================
  // 8. INTERCEPCIÓN DE NAVEGACIÓN (TABS)
  // ==========================================

  $('.tabs-nav a').on('click', function(e) {
    const href = $(this).attr('href');

    // Controlar acceso restringido a las páginas administrativas
    if ((href === 'admin.html' || href === 'ajustes.html') && !isAdminMode) {
      e.preventDefault();
      e.stopPropagation();
      openAdminModal(function() {
        // Al acceder exitosamente, redirigir a la página correspondiente
        window.location.href = href;
      });
      return;
    }
  });

  // ==========================================
  // 9. ARRANQUE DE LA APLICACIÓN
  // ==========================================
  
  loadState(function() {
    $('#pts-exact').val(state.config.pointsExact);
    $('#pts-winner').val(state.config.pointsWinner);
    $('#pts-closest').val(state.config.pointsClosest || 1);
    $('#pts-champion').val(state.config.pointsChampion || 10);
    updateRulesPoints();
    updateChampionVotingUI();

    const startTheme = state.config.theme || 'dark';
    $('html').attr('data-theme', startTheme);
    if (startTheme === 'light') {
      $('#theme-toggle').html('<i data-lucide="moon"></i>');
    } else {
      $('#theme-toggle').html('<i data-lucide="sun"></i>');
    }

    // Sincronizar UI del Administrador en carga
    updateAdminUI();

    const path = window.location.pathname.toLowerCase();
    function isCurrentPage(name) {
      const filename = path.substring(path.lastIndexOf('/') + 1);
      if (name === 'index') {
        return filename === '' || filename === 'index.html' || filename === 'index.php';
      }
      return filename.indexOf(name) !== -1;
    }

    const isAdminPage = isCurrentPage('admin');
    const isConfigPage = isCurrentPage('ajustes');

    // Proteger páginas administrativas en la carga inicial
    if ((isAdminPage || isConfigPage) && !isAdminMode) {
      $('main').css('opacity', '0');
      openAdminModal(function() {
        $('main').css('opacity', '1');
        if (isAdminPage) {
          renderAdminGrid();
          const teams = getParticipatingTeams();
          populateChampionDropdowns(teams);
        } else if (isConfigPage) {
          loadDbConfig();
          $('#btn-save-db-config').off('click').on('click', function() {
            saveDbConfig();
          });
          renderBonusPointsList();
          $('#btn-sync-pre-incident-points').off('click').on('click', function() {
            autoAdjustPreIncidentPoints();
          });
        }
      }, function() {
        window.location.href = 'index.html';
      });
    } else {
      // Inicializar vistas específicas de la página activa
      if (isCurrentPage('index')) {
        renderDashboard();
      } else if (isCurrentPage('calendario')) {
        renderScheduleGrid();
      } else if (isCurrentPage('clasificacion')) {
        renderLeaderboard();
      } else if (isCurrentPage('pronosticos')) {
        renderPlayersSelector();
        if (activePlayerId) {
          renderPredictionsGrid();
        }
      } else if (isCurrentPage('campeon')) {
        const teams = getParticipatingTeams();
        populateChampionDropdowns(teams);
        renderChampionVotesGrid(teams);
      } else if (isCurrentPage('estadisticas')) {
        initAnalyticsTab();
        renderAnalyticsTab();
      } else if (isAdminPage) {
        renderAdminGrid();
        const teams = getParticipatingTeams();
        populateChampionDropdowns(teams);
      } else if (isConfigPage) {
        loadDbConfig();
        $('#btn-save-db-config').off('click').on('click', function() {
          saveDbConfig();
        });
        renderBonusPointsList();
        $('#btn-sync-pre-incident-points').off('click').on('click', function() {
          autoAdjustPreIncidentPoints();
        });
      }
    }

    lucide.createIcons();
  });

});
