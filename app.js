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

  // ==========================================
  // 1. ESTADO Y CONFIGURACIÓN INICIAL
  // ==========================================
  
  let state = {
    players: [],
    realResults: {},
    config: {
      pointsExact: 3,
      pointsWinner: 1,
      pointsClosest: 1,
      adminPin: '1234',
      theme: 'dark'
    }
  };

  let activePlayerId = null;
  let isAdminMode = false; // Estado de sesión del administrador

  // Cargar estado desde LocalStorage
  function loadState(callback) {
    $.ajax({
      url: 'api.php?action=get',
      type: 'GET',
      dataType: 'json',
      success: function(data) {
        if (data && !data.status) { // Si no es un JSON con error
          state = data;
          if (!state.players) state.players = [];
          if (!state.realResults) state.realResults = {};
          if (!state.matchTeams) state.matchTeams = {};
          if (!state.config) {
            state.config = { pointsExact: 3, pointsWinner: 1, pointsClosest: 1, adminPin: '1234', theme: 'dark' };
          }
          if (state.config.pointsClosest === undefined) {
            state.config.pointsClosest = 1;
          }
          if (state.config.adminPin === undefined) {
            state.config.adminPin = '1234';
          }
          console.log("Estado cargado exitosamente desde la base de datos MySQL.");
        } else {
          console.warn("Respuesta inválida del servidor, usando LocalStorage.");
          loadStateFromLocalStorage();
        }
        finishLoading();
      },
      error: function() {
        console.warn("No se pudo conectar con api.php, usando LocalStorage.");
        loadStateFromLocalStorage();
        finishLoading();
      }
    });

    function loadStateFromLocalStorage() {
      const saved = localStorage.getItem('quiniela_wc2026_state');
      if (saved) {
        try {
          state = JSON.parse(saved);
          if (!state.players) state.players = [];
          if (!state.realResults) state.realResults = {};
          if (!state.matchTeams) state.matchTeams = {};
          if (!state.config) {
            state.config = { pointsExact: 3, pointsWinner: 1, pointsClosest: 1, adminPin: '1234', theme: 'dark' };
          }
          if (state.config.pointsClosest === undefined) {
            state.config.pointsClosest = 1;
          }
          if (state.config.adminPin === undefined) {
            state.config.adminPin = '1234';
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
      
      if (state.players.length > 0) {
        activePlayerId = state.players[0].id;
      } else {
        activePlayerId = null;
      }
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
        adminPin: '1234',
        theme: 'dark'
      }
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

  // Guardar estado en LocalStorage y Base de Datos (MySQL)
  function saveState() {
    // 1. Guardar en LocalStorage como copia local / offline
    localStorage.setItem('quiniela_wc2026_state', JSON.stringify(state));
    
    // 2. Intentar guardar en el servidor a través de api.php
    $.ajax({
      url: 'api.php?action=save',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(state),
      success: function(response) {
        if (response && response.status === 'success') {
          console.log("Estado guardado correctamente en la base de datos remota.");
        } else {
          console.error("Error al guardar en base de datos: " + (response ? response.message : "Desconocido"));
        }
      },
      error: function(xhr, status, error) {
        console.error("Error de conexión con el servidor de base de datos:", error);
      }
    });
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
      $('#pts-exact, #pts-winner, #pts-closest, #btn-save-pts-config').prop('disabled', false);
      $('#btn-reset-players, #btn-reset-all').prop('disabled', false);
      
      // Habilitar controles de jugadores
      $('#new-player-name, #btn-add-player, #btn-delete-player').prop('disabled', false);

      // Quitar clase bloqueada si existía en botones de tab
      $('.tab-btn[data-target="#tab-admin"]').find('i').removeClass('lucide-lock').addClass('lucide-settings');
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
      $('#pts-exact, #pts-winner, #pts-closest, #btn-save-pts-config').prop('disabled', true);
      $('#btn-reset-players, #btn-reset-all').prop('disabled', true);
      
      // Deshabilitar controles de jugadores
      $('#new-player-name, #btn-add-player, #btn-delete-player').prop('disabled', true);

      // Cambiar icono en los botones de navegación de pestañas
      $('.tab-btn[data-target="#tab-admin"]').find('i').removeClass('lucide-settings').addClass('lucide-lock');
    }
    
    // Rerenderizar grillas si existen elementos para mantener en sincronía los campos de ingreso
    if (activePlayerId) {
      renderPredictionsGrid();
    }
    renderAdminGrid();
    
    lucide.createIcons();
  }

  // Abrir modal de Login
  function openAdminModal() {
    $('#admin-pin-input').val('');
    $('#admin-login-error').hide();
    $('#admin-modal').css('display', 'flex');
    setTimeout(() => {
      $('#admin-modal-card').css('transform', 'translateY(0)');
      $('#admin-pin-input').focus();
    }, 50);
  }

  // Cerrar modal de Login
  function closeAdminModal() {
    $('#admin-modal-card').css('transform', 'translateY(-20px)');
    setTimeout(() => {
      $('#admin-modal').fadeOut(150);
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
      closeAdminModal();
      updateAdminUI();
      
      // Redirigir automáticamente a la pestaña Admin
      showToast("Acceso Administrador concedido.");
      $('.tab-btn[data-target="#tab-admin"]').click();
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
    saveState();
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
        
        // Si estaba en la pestaña admin, redirigir a dashboard
        if ($('.tab-panel.active').attr('id') === 'tab-admin') {
          $('.tab-btn[data-target="#tab-dashboard"]').click();
        } else {
          // Rerenderizar Ajustes por si estaba en esa tab y bloquear campos
          renderAdminGrid();
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
      return { points: parseInt(state.config.pointsExact || 3), type: 'exact' };
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
      let totalPoints = 0;
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

      return {
        id: player.id,
        name: player.name,
        totalPoints,
        exactHits,
        closestHits,
        winnerHits,
        incorrects,
        predictedCount
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
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 3rem;">
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

      tbody.append(`
        <tr class="player-row" id="${rowId}" data-player-id="${player.id}">
          <td><span class="position-badge ${posClass}">${pos}</span></td>
          <td style="font-weight: 600; font-family: 'Outfit';">${player.name}</td>
          <td style="text-align: center;">${player.predictedCount} / 104</td>
          <td style="text-align: center; color: var(--primary); font-weight: 600;">${player.exactHits}</td>
          <td style="text-align: center; color: var(--info); font-weight: 600;">${player.closestHits}</td>
          <td style="text-align: center; color: var(--secondary); font-weight: 600;">${player.winnerHits}</td>
          <td style="text-align: center; color: var(--text-muted); font-weight: 600;">${player.incorrects}</td>
          <td style="text-align: right; font-weight: 700; font-size: 1.1rem; color: var(--primary);">${player.totalPoints}</td>
        </tr>
        <tr class="player-details-row" id="${detailId}">
          <td colspan="8" style="padding: 0;">
            <div class="details-grid" id="details-grid-${player.id}">
              <!-- Llenado al abrir para optimizar performance -->
            </div>
          </td>
        </tr>
      `);
    });

    $('.player-row').off('click').on('click', function() {
      const playerId = $(this).data('player-id');
      const detailRow = $(`#detail-player-${playerId}`);
      
      if (detailRow.is(':visible')) {
        detailRow.slideUp(150);
      } else {
        $('.player-details-row').hide();
        renderPlayerDetails(playerId);
        detailRow.slideDown(200);
      }
    });
  }

  // Renderizar detalles de un jugador expandido en la clasificación
  function renderPlayerDetails(playerId) {
    const player = state.players.find(p => p.id == playerId);
    const container = $(`#details-grid-${playerId}`);
    container.empty();

    if (!player) return;

    if (typeof WORLD_CUP_2026_MATCHES === 'undefined' || WORLD_CUP_2026_MATCHES.length === 0) {
      container.append('<p style="padding: 1rem; color: var(--text-muted);">No hay partidos cargados.</p>');
      return;
    }

    let matchCount = 0;

    WORLD_CUP_2026_MATCHES.forEach(match => {
      const pred = player.predictions[match.id];
      const real = state.realResults[match.id];
      
      const hasPred = pred && pred.goals1 !== null && pred.goals1 !== undefined && pred.goals1 !== "";
      const isFinished = real && real.status === 'finished';

      if (!hasPred && !isFinished) return;

      matchCount++;

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

      if (isFinished && hasPred) {
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
      }

      const resolvedTeam1 = getTeamName(match.id, 1, match.team1);
      const resolvedTeam2 = getTeamName(match.id, 2, match.team2);
      const flag1HTML = getTeamFlagHTML(resolvedTeam1);
      const flag2HTML = getTeamFlagHTML(resolvedTeam2);

      container.append(`
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

    if (matchCount === 0) {
      container.append('<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 1.5rem;">Este jugador no ha registrado pronósticos ni hay partidos jugados.</p>');
    }
  }

  // Renderizar Selector de Jugadores en Pronósticos
  function renderPlayersSelector() {
    const container = $('#players-list-container');
    container.empty();

    if (state.players.length === 0) {
      $('#no-players-placeholder').show();
      $('#predictions-content-area').hide();
      return;
    }

    $('#no-players-placeholder').hide();
    $('#predictions-content-area').show();

    const leaderboard = getPlayersLeaderboard();

    state.players.forEach(player => {
      const leaderInfo = leaderboard.find(l => l.id === player.id) || { totalPoints: 0 };
      const isActive = player.id === activePlayerId ? 'active' : '';

      container.append(`
        <div class="player-select-item ${isActive}" data-id="${player.id}">
          <span class="player-select-name">
            <i data-lucide="user"></i> ${player.name}
          </span>
          <span class="player-select-pts">${leaderInfo.totalPoints} pts</span>
        </div>
      `);
    });

    $('.player-select-item').off('click').on('click', function() {
      const id = $(this).data('id');
      activePlayerId = id;
      $('.player-select-item').removeClass('active');
      $(this).addClass('active');
      
      const activePlayer = state.players.find(p => p.id == activePlayerId);
      if (activePlayer) {
        $('#active-player-name-label').text(activePlayer.name);
      }
      
      renderPredictionsGrid();
    });

    const activePlayer = state.players.find(p => p.id == activePlayerId);
    if (activePlayer) {
      $('#active-player-name-label').text(activePlayer.name);
    } else if (state.players.length > 0) {
      activePlayerId = state.players[0].id;
      $('#active-player-name-label').text(state.players[0].name);
    }

    lucide.createIcons();
  }

  // Renderizar Grid de Partidos en Pronósticos (con banderas)
  function renderPredictionsGrid() {
    const grid = $('#predictions-matches-grid');
    grid.empty();

    const activePlayer = state.players.find(p => p.id == activePlayerId);
    if (!activePlayer) return;

    if (typeof WORLD_CUP_2026_MATCHES === 'undefined') {
      grid.append('<p style="padding: 2rem; color: var(--text-muted);">Error: partidos no definidos.</p>');
      return;
    }

    const groupFilter = $('#filter-group-pred').val();
    const statusFilter = $('#filter-status-pred').val();

    let matchesCount = 0;

    WORLD_CUP_2026_MATCHES.forEach(match => {
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

      let statusBadgeHTML = '';
      if (real.status === 'finished') {
        statusBadgeHTML = '<span class="match-status-badge status-finished">Finalizado</span>';
      } else if (real.status === 'live') {
        statusBadgeHTML = '<span class="match-status-badge status-live">En Vivo</span>';
      } else {
        statusBadgeHTML = '<span class="match-status-badge status-scheduled">Pendiente</span>';
      }

      let footerFeedbackHTML = '';
      let disabledAttr = !isAdminMode ? 'disabled' : '';
      let cardBorderGlow = '';

      if (isFinished) {
        disabledAttr = 'disabled';
        const pointsData = getPlayerPointsForMatch(activePlayerId, match.id);
        
        let ptsClass = 'color: var(--text-muted);';
        let feedbackText = 'Fallo';

        if (pointsData.type === 'exact') {
          ptsClass = 'color: var(--primary); font-weight: 700;';
          feedbackText = `Marcador Exacto (+${pointsData.points} pts)`;
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

        footerFeedbackHTML = `
          <div style="display: flex; flex-direction: column; width: 100%; gap: 0.2rem; background: rgba(0,0,0,0.15); padding: 0.5rem; border-radius: var(--border-radius-sm); margin-top: 0.4rem;">
            <div style="display: flex; justify-content: space-between;">
              <span>Resultado Real:</span>
              <span style="font-weight: 700;">${real.goals1} - ${real.goals2}</span>
            </div>
            <div style="display: flex; justify-content: space-between; ${ptsClass}">
              <span>Resultado Pronóstico:</span>
              <span>${feedbackText}</span>
            </div>
          </div>
        `;
      }

      const resolvedTeam1 = getTeamName(match.id, 1, match.team1);
      const resolvedTeam2 = getTeamName(match.id, 2, match.team2);
      const flag1HTML = getTeamFlagHTML(resolvedTeam1);
      const flag2HTML = getTeamFlagHTML(resolvedTeam2);

      grid.append(`
        <div class="match-card" style="${cardBorderGlow}">
          <div class="match-card-header">
            <span>${match.round}</span>
            ${match.group ? `<span class="match-group">${match.group}</span>` : ''}
          </div>
          
          <div class="match-card-body">
            <!-- Team 1 -->
            <div class="team-row">
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
            
            <!-- Team 2 -->
            <div class="team-row">
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

            ${footerFeedbackHTML}
          </div>

          <div class="match-card-footer">
            <span class="match-venue" title="${match.ground}">${match.ground}</span>
            ${statusBadgeHTML}
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
      lucide.createIcons();
    }

    $('.pred-input').off('change').on('change', function() {
      if (!isAdminMode) {
        showToast("Acceso Administrador requerido.", "error");
        renderPredictionsGrid();
        return;
      }
      const matchId = $(this).data('match-id');
      const card = $(this).closest('.match-card');
      const val1 = card.find('.pred-input[data-team="1"]').val();
      const val2 = card.find('.pred-input[data-team="2"]').val();

      const pIdx = state.players.findIndex(p => p.id == activePlayerId);
      if (pIdx === -1) return;

      if (!state.players[pIdx].predictions[matchId]) {
        state.players[pIdx].predictions[matchId] = { goals1: "", goals2: "" };
      }

      if (val1 === "" && val2 === "") {
        delete state.players[pIdx].predictions[matchId];
        saveState();
        showSaveIndicator(true);
        return;
      }

      state.players[pIdx].predictions[matchId].goals1 = val1;
      state.players[pIdx].predictions[matchId].goals2 = val2;

      saveState();
      showSaveIndicator(true);
      renderDashboard();
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

    WORLD_CUP_2026_MATCHES.forEach(match => {
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

      grid.append(`
        <div class="match-card" style="${real.status === 'live' ? 'border-color: var(--info);' : ''}">
          <div class="match-card-header">
            <span>${match.round}</span>
            ${match.group ? `<span class="match-group">${match.group}</span>` : ''}
          </div>
          
          <div class="match-card-body">
            <!-- Team 1 -->
            <div class="team-row">
              <div class="team-info" style="width: 100%; display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
                ${flag1HTML}
                ${match.group === "" ? `
                  <input type="text" class="input-text admin-team-name-input" 
                    data-match-id="${match.id}" data-team="1" 
                    value="${resolvedTeam1}" 
                    placeholder="Equipo 1"
                    style="flex: 1; padding: 0.3rem 0.5rem; font-size: 0.85rem; height: 32px; min-width: 80px;"
                    ${disabledAttr}>
                ` : `
                  <span class="team-name" title="${resolvedTeam1}">${resolvedTeam1}</span>
                `}
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
                ${match.group === "" ? `
                  <input type="text" class="input-text admin-team-name-input" 
                    data-match-id="${match.id}" data-team="2" 
                    value="${resolvedTeam2}" 
                    placeholder="Equipo 2"
                    style="flex: 1; padding: 0.3rem 0.5rem; font-size: 0.85rem; height: 32px; min-width: 80px;"
                    ${disabledAttr}>
                ` : `
                  <span class="team-name" title="${resolvedTeam2}">${resolvedTeam2}</span>
                `}
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
      lucide.createIcons();
    }

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

      saveState();
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

      saveState();
      renderDashboard();
      renderLeaderboard();
      showToast(`Partido ID ${matchId} actualizado.`);
    });
  }

  // Renderizar Calendario general (con banderas y estadísticas)
  function renderScheduleGrid() {
    const grid = $('#schedule-matches-grid');
    grid.empty();

    if (typeof WORLD_CUP_2026_MATCHES === 'undefined') return;

    const groupFilter = $('#filter-group-schedule').val();
    const searchTerm = $('#search-team-schedule').val().trim().toLowerCase();

    let matchesCount = 0;

    WORLD_CUP_2026_MATCHES.forEach(match => {
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

      const real = state.realResults[match.id] || { goals1: null, goals2: null, status: 'scheduled' };

      let scoreHTML = '';
      let statusBadgeHTML = '';

      if (real.status === 'finished') {
        scoreHTML = `<span class="schedule-score-display">${real.goals1} - ${real.goals2}</span>`;
        statusBadgeHTML = '<span class="match-status-badge status-finished">Finalizado</span>';
      } else if (real.status === 'live') {
        scoreHTML = `<span class="schedule-score-display" style="color: var(--info); border-color: var(--info); box-shadow: 0 0 8px rgba(14, 165, 233, 0.25);">${real.goals1 !== null ? real.goals1 : 0} - ${real.goals2 !== null ? real.goals2 : 0}</span>`;
        statusBadgeHTML = '<span class="match-status-badge status-live">En Vivo</span>';
      } else {
        scoreHTML = '<span class="schedule-vs-badge">VS</span>';
        statusBadgeHTML = '<span class="match-status-badge status-scheduled">Pendiente</span>';
      }

      let predictedCount = 0;
      state.players.forEach(p => {
        const pred = p.predictions[match.id];
        if (pred && pred.goals1 !== null && pred.goals1 !== "" && pred.goals2 !== null && pred.goals2 !== "") {
          predictedCount++;
        }
      });
      const totalPlayers = state.players.length;

      const flag1HTML = getTeamFlagHTML(resolvedTeam1);
      const flag2HTML = getTeamFlagHTML(resolvedTeam2);

      grid.append(`
        <div class="match-card" style="${real.status === 'live' ? 'border-color: var(--info);' : ''}">
          <div class="match-card-header">
            <span>${match.round}</span>
            ${match.group ? `<span class="match-group">${match.group}</span>` : ''}
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
          </div>

          <div class="match-card-footer" style="flex-direction: column; gap: 0.5rem; align-items: stretch; border-top: none; padding-top: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted); border-top: 1px solid rgba(255, 255, 255, 0.04); padding-top: 0.5rem; margin-top: 0.2rem;">
              <span class="match-venue" title="${match.ground}">${match.ground}</span>
              ${statusBadgeHTML}
            </div>
            
            <div class="schedule-pred-stats">
              <i data-lucide="users" style="width: 13px; height: 13px;"></i>
              <span>${predictedCount} de ${totalPlayers} jugadores pronosticaron este partido</span>
            </div>
          </div>
        </div>
      `);
    });

    $('#schedule-matches-count').text(matchesCount);

    if (matchesCount === 0) {
      grid.append(`
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 4rem 2rem;">
          <i data-lucide="filter" style="width: 48px; height: 48px; margin-bottom: 0.8rem; opacity: 0.6;"></i>
          <p>No se encontraron partidos para la búsqueda seleccionada.</p>
        </div>
      `);
    }

    lucide.createIcons();
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
      id: Date.now(),
      name: name,
      predictions: {}
    };

    state.players.push(newPlayer);
    activePlayerId = newPlayer.id;

    saveState();
    nameInput.val('');
    
    renderPlayersSelector();
    renderPredictionsGrid();
    renderDashboard();
    renderLeaderboard();

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
      
      if (state.players.length > 0) {
        activePlayerId = state.players[0].id;
      } else {
        activePlayerId = null;
      }

      saveState();

      renderPlayersSelector();
      renderPredictionsGrid();
      renderDashboard();
      renderLeaderboard();

      showToast(`Jugador "${player.name}" eliminado.`);
    }
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

      saveState();

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

    if (isNaN(ptsExact) || ptsExact < 0 || isNaN(ptsWinner) || ptsWinner < 0 || isNaN(ptsClosest) || ptsClosest < 0) {
      showToast("Ingresa valores de puntaje válidos (mayores o iguales a 0).", "error");
      return;
    }

    state.config.pointsExact = ptsExact;
    state.config.pointsWinner = ptsWinner;
    state.config.pointsClosest = ptsClosest;

    saveState();
    renderDashboard();
    renderLeaderboard();
    if (activePlayerId) {
      renderPredictionsGrid();
    }

    showToast("Configuración de puntos aplicada y clasificaciones recalculadas.");
  });

  $('#theme-toggle').on('click', function() {
    const currentTheme = $('html').attr('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    $('html').attr('data-theme', newTheme);
    state.config.theme = newTheme;
    saveState();

    if (newTheme === 'light') {
      $(this).html('<i data-lucide="moon"></i>');
    } else {
      $(this).html('<i data-lucide="sun"></i>');
    }
    lucide.createIcons();
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
      "Puntos Totales": p.totalPoints
    }));
    
    const wsBoard = XLSX.utils.json_to_sheet(boardData);
    XLSX.utils.book_append_sheet(wb, wsBoard, "Clasificación General");

    const resultsData = WORLD_CUP_2026_MATCHES.map(match => {
      const real = state.realResults[match.id] || { goals1: null, goals2: null, status: 'scheduled' };
      const resolvedT1 = getTeamName(match.id, 1, match.team1);
      const resolvedT2 = getTeamName(match.id, 2, match.team2);
      return {
        "ID Partido": match.id,
        "Fase/Jornada": match.round,
        "Grupo": match.group || "Eliminatorias",
        "Fecha": match.date,
        "Hora": match.time,
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
          saveState();

          if (state.players.length > 0) {
            activePlayerId = state.players[0].id;
          } else {
            activePlayerId = null;
          }

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
      saveState();

      renderDashboard();
      renderLeaderboard();
      renderPlayersSelector();
      renderPredictionsGrid();
      renderScheduleGrid();

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
      saveState();
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

  // ==========================================
  // 8. MANEJO DE PESTAÑAS (TABS) CON COMPROBACIÓN DE ROL
  // ==========================================

  $('.tab-btn').on('click', function(e) {
    const target = $(this).data('target');

    // Controlar acceso restringido a la pestaña de administración
    if (target === '#tab-admin' && !isAdminMode) {
      e.preventDefault();
      e.stopPropagation();
      openAdminModal();
      return; // Detener cambio de pestaña
    }

    $('.tab-btn').removeClass('active');
    $(this).addClass('active');

    $('.tab-panel').removeClass('active');
    $(target).addClass('active');

    if (target === '#tab-dashboard') {
      renderDashboard();
    } else if (target === '#tab-schedule') {
      renderScheduleGrid();
    } else if (target === '#tab-leaderboard') {
      renderLeaderboard();
    } else if (target === '#tab-predictions') {
      renderPlayersSelector();
      if (activePlayerId) {
        renderPredictionsGrid();
      }
    } else if (target === '#tab-admin') {
      renderAdminGrid();
    }
  });

  // ==========================================
  // 9. ARRANQUE DE LA APLICACIÓN
  // ==========================================
  
  loadState(function() {
    $('#pts-exact').val(state.config.pointsExact);
    $('#pts-winner').val(state.config.pointsWinner);
    $('#pts-closest').val(state.config.pointsClosest || 1);

    const startTheme = state.config.theme || 'dark';
    $('html').attr('data-theme', startTheme);
    if (startTheme === 'light') {
      $('#theme-toggle').html('<i data-lucide="moon"></i>');
    } else {
      $('#theme-toggle').html('<i data-lucide="sun"></i>');
    }

    // Sincronizar UI del Administrador en carga
    updateAdminUI();

    renderDashboard();
    renderLeaderboard();
    renderPlayersSelector();
    if (activePlayerId) {
      renderPredictionsGrid();
    }
    renderAdminGrid();
    renderScheduleGrid();

    lucide.createIcons();
  });

});
