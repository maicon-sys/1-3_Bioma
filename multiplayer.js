// ===============================
// 4MOVIE - BIOMA Multiplayer Manager (versão estável)
// ===============================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/+esm';

// --- Conexão com Supabase ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Funções auxiliares ---
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
function generatePlayerId() {
  return crypto.randomUUID();
}

// ===============================
//  CLASSE PRINCIPAL
// ===============================
class MultiplayerManager {
  constructor() {
    this.currentRoom = null;
    this.currentPlayer = null;
    this.playerId = null;
    this.roomSubscription = null;
    this.playersSubscription = null;
    this.actionsSubscription = null;
    this.onRoomUpdateCallback = null;
    this.onPlayersUpdateCallback = null;
    this.onActionCallback = null;
    this.isHost = false;
  }

  // --- Cria sala (somente o host) ---
  async createRoom(hostName, selectedBiomes, specialCardsCount) {
    const code = generateRoomCode();
    const tempPlayerId = generatePlayerId();

    // Cria a sala
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        code,
        host_id: tempPlayerId,
        selected_biomes: selectedBiomes,
        special_cards_count: specialCardsCount,
        status: 'waiting'
      })
      .select()
      .maybeSingle();

    if (roomError) throw roomError;

    // Cria o jogador host
    const { data: player, error: playerError } = await supabase
      .from('room_players')
      .insert({
        room_id: room.id,
        player_id: tempPlayerId,
        name: hostName,
        player_order: 0,
        biome: selectedBiomes[0],
        is_ready: false
      })
      .select()
      .maybeSingle();

    if (playerError) throw playerError;

    this.currentRoom = room;
    this.currentPlayer = player;
    this.playerId = tempPlayerId;
    this.isHost = true;

    await this.subscribeToRoom(room.id);

    return { room, player, code };
  }

  // --- Entrar em uma sala existente ---
  async joinRoom(code, playerName) {
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!room) throw new Error('Sala não encontrada');
    if (room.status !== 'waiting') throw new Error('Sala já iniciou');

    const { data: existingPlayers, error: playersError } = await supabase
      .from('room_players')
      .select('*')
      .eq('room_id', room.id)
      .order('player_order');

    if (playersError) throw playersError;

    const availableBiomes = room.selected_biomes.filter(
      biome => !existingPlayers.some(p => p.biome === biome)
    );
    if (availableBiomes.length === 0) throw new Error('Sala cheia');

    const playerId = generatePlayerId();
    const playerOrder = existingPlayers.length;

    const { data: player, error: joinError } = await supabase
      .from('room_players')
      .insert({
        room_id: room.id,
        player_id: playerId,
        name: playerName,
        player_order: playerOrder,
        biome: availableBiomes[0],
        is_ready: false
      })
      .select()
      .maybeSingle();

    if (joinError) throw joinError;

    this.currentRoom = room;
    this.currentPlayer = player;
    this.playerId = playerId;
    this.isHost = false;

    await this.subscribeToRoom(room.id);
    return { room, player };
  }

  // --- Marcar jogador como pronto ---
  async setReady(isReady = true) {
    if (!this.currentPlayer) return;
    await supabase
      .from('room_players')
      .update({ is_ready: isReady })
      .eq('id', this.currentPlayer.id);
  }

  // --- Iniciar jogo (somente host, valida tudo) ---
  async startGame(deck) {
    const { data: room } = await supabase
      .from('rooms')
      .select('host_id')
      .eq('id', this.currentRoom.id)
      .maybeSingle();

    if (room.host_id !== this.playerId) {
      throw new Error('Apenas o dono da sala pode iniciar o jogo');
    }

    const { data: players } = await supabase
      .from('room_players')
      .select('*')
      .eq('room_id', this.currentRoom.id)
      .order('player_order');

    if (!players || players.length < 2)
      throw new Error('É necessário no mínimo 2 jogadores');
    const allReady = players.every(p => p.is_ready);
    if (!allReady)
      throw new Error('Todos os jogadores precisam estar prontos');

    await supabase
      .from('rooms')
      .update({
        status: 'playing',
        deck,
        current_player_index: 0,
        action_taken: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', this.currentRoom.id);
  }

  // --- Avançar turno ---
  async nextTurn() {
    const { data: room } = await supabase
      .from('rooms')
      .select('current_player_index')
      .eq('id', this.currentRoom.id)
      .maybeSingle();

    const { data: players } = await supabase
      .from('room_players')
      .select('*')
      .eq('room_id', this.currentRoom.id)
      .order('player_order');

    const nextIndex = (room.current_player_index + 1) % players.length;
    await supabase
      .from('rooms')
      .update({
        current_player_index: nextIndex,
        action_taken: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', this.currentRoom.id);
  }

  // --- Escutar atualizações em tempo real ---
  async subscribeToRoom(roomId) {
    this.roomSubscription = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (this.onRoomUpdateCallback) {
            this.onRoomUpdateCallback(payload.new);
          }
        }
      )
      .subscribe();

    this.playersSubscription = supabase
      .channel(`players:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        async () => {
          const players = await this.getPlayers(roomId);
          if (this.onPlayersUpdateCallback) {
            this.onPlayersUpdateCallback(players);
          }
        }
      )
      .subscribe();
  }

  async getPlayers(roomId) {
    const { data, error } = await supabase
      .from('room_players')
      .select('*')
      .eq('room_id', roomId)
      .order('player_order');
    if (error) throw error;
    return data;
  }

  async updatePlayerCards(playerId, hand, biomeZone, effects) {
    await supabase
      .from('room_players')
      .update({ hand, biome_zone: biomeZone, effects })
      .eq('room_id', this.currentRoom.id)
      .eq('player_id', playerId);
  }

  async disconnect() {
    if (this.roomSubscription) await this.roomSubscription.unsubscribe();
    if (this.playersSubscription) await this.playersSubscription.unsubscribe();
    if (this.currentPlayer) {
      await supabase
        .from('room_players')
        .update({ is_connected: false })
        .eq('id', this.currentPlayer.id);
    }
  }

  onRoomUpdate(callback) {
    this.onRoomUpdateCallback = callback;
  }
  onPlayersUpdate(callback) {
    this.onPlayersUpdateCallback = callback;
  }
}

// ===============================
//  EXPORTAÇÕES
// ===============================
export { MultiplayerManager, generatePlayerId, generateRoomCode };
