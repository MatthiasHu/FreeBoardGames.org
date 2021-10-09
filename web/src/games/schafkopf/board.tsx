import * as React from 'react';
import { Ctx } from 'boardgame.io';
import { IGameArgs } from 'gamesShared/definitions/game';
import { Pattern, CardColor, ICard } from 'gamesShared/definitions/cards';
import { GameLayout } from 'gamesShared/components/fbg/GameLayout';
import { Hand } from 'gamesShared/components/cards/Hand';
import { PreviousTrick } from 'gamesShared/components/cards/PreviousTrick';
import { CalledCard } from 'gamesShared/components/cards/CalledCard';
import { Trick } from 'gamesShared/components/cards/Trick';
import { Kitty } from 'gamesShared/components/cards/Kitty';
import { ButtonBar } from 'gamesShared/components/cards/ButtonBar';
import { PlayerZones } from 'gamesShared/components/cards/PlayerZones';
import { RoundScores } from 'gamesShared/components/cards/RoundScores';
import { IScore, Scoreboard } from 'gamesShared/components/scores/Scoreboard';
import { isLocalGame } from 'gamesShared/helpers/gameMode';
import { useCurrentGameTranslation } from 'infra/i18n';

import css from './board.module.css';

import { Phases, Stages, IGameMoves, IG, Contract } from './types';
import * as util from './util/misc';
import * as u_discard from './util/discard';
import * as u_placement from './util/placement';

export function BgioBoard(props: { G: IG; ctx: Ctx; moves: IGameMoves; playerID: string; gameArgs?: IGameArgs }) {
  const { translate } = useCurrentGameTranslation();
  const [declinedContra, setDeclinedContra] = React.useState(false);

  const G = props.G;
  const ctx = props.ctx;
  const moves = props.moves;
  const playerID = isLocalGame(props.gameArgs) ? props.ctx.currentPlayer : props.playerID;
  const player = util.getPlayerById(G, playerID);
  const playerPhase = ctx.currentPlayer === playerID && ctx.phase;
  const playerStage = ctx.activePlayers && ctx.activePlayers[playerIndex()];
  const playerNames = G.players.map((P) => playerName(P.id));
  const showRoundSummary = ctx.phase == Phases.round_end && G.roundSummaries.length > 0;
  const canDiscard = player.isTaker && playerPhase == Phases.discard;

  let prevTrick = G.trick;
  if (G.resolvedTricks.length > (util.kittySize(ctx.numPlayers) > 0 ? 1 : 0)) {
    prevTrick = G.resolvedTricks[G.resolvedTricks.length - 1];
  }

  function renderBoard() {
    let selectableCards: boolean[] = player.hand.map(() => false);
    let canSelectCards = false;
    if (playerPhase == Phases.discard) {
      selectableCards = u_discard.selectableCards(G, playerID);
      canSelectCards = player.isTaker;
    } else if (playerPhase == Phases.placement) {
      selectableCards = u_placement.selectableCards(G, playerID);
      canSelectCards = true;
    }
    const selectedCards = canDiscard ? player.discardSelection : [];
    return (
      <GameLayout gameArgs={props.gameArgs} maxWidth="1500px">
        <div className={css.board}>
          <div className={css.upperBoard}>
            {renderRoundScores()}
            {renderTrumpSuit()}
            {renderCalledCard()}
            {renderPrevTrick()}
            {renderKitty()}
            {renderPlayerZones()}
            {renderTrick()}
            {renderButtonBar()}
          </div>
          <div className={css.lowerBoard}>
            <Hand
              playerId={player.id}
              hand={player.hand}
              pattern={Pattern.Franconian}
              selectable={selectableCards}
              selection={selectedCards || []}
              selectCards={canSelectCards ? moves.SelectCards : null}
            />
          </div>
        </div>
      </GameLayout>
    );
  }

  function renderRoundScores() {
    const roundSummaries = G.roundSummaries.map((summary) => {
      const playerRoles = G.players.map((P) => {
        return P.id == summary.takerId || P.id == summary.calledTakerId;
      });
      const playerKeys = playerNames.map((_, i) => i);
      const players = playerKeys.filter((i) => playerRoles[i]).concat(playerKeys.filter((i) => !playerRoles[i]));
      const points = players.map((i) => {
        const takerPoints = summary.takerPoints;
        const requiredPoints = playerRoles[i] ? `(${summary.takerPointsRequired})` : '';
        return `${playerRoles[i] ? takerPoints : 120 - takerPoints}${requiredPoints}`;
      });
      const running = summary.running >= 3 ? `${summary.running}` : `(${summary.running})`;
      return {
        players: players,
        scoring: players.map((i) => summary.scoring[i].toString()),
        details: [
          {
            description: translate('scoreboard_points'),
            values: points,
          },
          {
            description: translate('scoreboard_basic'),
            values: players.map((i) => (playerRoles[i] ? `${summary.basic}` : '-')),
          },
          {
            description: translate('scoreboard_running'),
            values: players.map((i) => (playerRoles[i] && !isNone(summary.running) ? running : '-')),
          },
          {
            description: translate('scoreboard_schneider'),
            values: players.map((i) => (playerRoles[i] && !isNone(summary.schneider) ? `${summary.schneider}` : '-')),
          },
          {
            description: translate('scoreboard_schwarz'),
            values: players.map((i) => (playerRoles[i] && !isNone(summary.schwarz) ? `${summary.schwarz}` : '-')),
          },
          {
            description: translate('scoreboard_multiplier'),
            values: players.map((i) => (playerRoles[i] ? `×${summary.multiplier}` : '-')),
          },
        ],
      };
    });
    return (
      <RoundScores
        playerNames={playerNames}
        roundSummaries={roundSummaries}
        showRoundSummary={showRoundSummary}
        playerScores={G.players.map((p) => p.score)}
      />
    );
  }

  function renderPrevTrick() {
    const isKitty = G.kittyPrev.length > 0;
    const inGame = G.players.some((P) => P.isTaker) && prevTrick.cards.length > 0;
    if (!isKitty && !inGame) return;
    return (
      <PreviousTrick
        trick={isKitty ? G.kittyPrev : prevTrick.cards}
        pattern={Pattern.Franconian}
        leaderPos={isKitty ? 0 : +prevTrick.leaderId}
        currPos={isKitty ? 0 : +player.id}
        numPlayers={isKitty ? G.kittyPrev.length : G.players.length}
        isKitty={isKitty}
      />
    );
  }

  function renderCalledCard() {
    if (!G.calledCard) return;
    const takerId = G.players.findIndex((P) => P.isTaker);
    return (
      <CalledCard
        description={translate('callcard_player_called', { name: playerNames[takerId] })}
        card={G.calledCard}
        pattern={Pattern.Franconian}
      />
    );
  }

  function renderTrumpSuit() {
    if (G.trumpSuit === null || G.contract != Contract.Solo) return;
    const trumpCard: ICard = { color: G.trumpSuit, value: 10 };
    return (
      <CalledCard description={translate('callcard_is_trumpsuit')} card={trumpCard} pattern={Pattern.Franconian} />
    );
  }

  function renderKitty() {
    return <Kitty kitty={G.kitty} pattern={Pattern.Franconian} revealed={G.kittyRevealed || player.isTaker} />;
  }

  function renderTrick() {
    const trick = G.kitty.length > 0 ? null : G.trick.cards.length > 0 ? G.trick : prevTrick;
    return (
      <Trick
        trick={trick ? trick.cards : []}
        pattern={Pattern.Franconian}
        leaderPos={trick && trick.leaderId ? +trick.leaderId : 0}
        winnerPos={trick && trick.winnerId ? +trick.winnerId : -1}
        currPos={+player.id}
        numPlayers={G.players.length}
      />
    );
  }

  function renderButtonBar() {
    const buttons = [
      renderButtonsBid(),
      renderButtonsDiscard(),
      renderButtonsCall(),
      renderButtonsTrump(),
      renderButtonsTout(),
      renderButtonsContra(),
      renderButtonsFinish(),
    ].filter((b) => b);
    return buttons.length > 0 ? buttons[0] : null;
  }

  function renderButtonsBid() {
    if (playerPhase != Phases.bidding || player.bid == 0) return;
    const highest_bid = Math.max(...G.players.map((P) => P.bid));
    const is_first_bidround = player.bid == Contract.None;
    const allowed_bids = util.allowedBids(G.players.length, is_first_bidround);
    const canCallAce = ['Schell', 'Gras', 'Eichel'].some((colName) => {
      const colorInHand = player.hand.filter((C) => C.color == CardColor[colName]);
      if (colorInHand.some((C) => C.value == 14)) {
        return false;
      }
      return !colorInHand.every((C) => [11, 12].indexOf(C.value) >= 0);
    });
    const click = allowed_bids.map((bid) => {
      let selectable = bid <= Contract.Some || highest_bid < bid;
      if (bid == Contract.Ace && !canCallAce) {
        selectable = false;
      }
      return selectable ? () => moves.MakeBid(bid) : null;
    });
    return (
      <ButtonBar
        click={click}
        texts={allowed_bids.map((bid) => translate(util.getBidName(bid)))}
        red={allowed_bids.map((bid) => bid == 0)}
      />
    );
  }

  function renderButtonsDiscard() {
    if (!canDiscard || !player.discardSelection) return;
    const discard_num = util.kittySize(G.players.length);
    const missing_num = discard_num - player.discardSelection.length;
    const clickable = missing_num == 0;
    const text = translate(clickable ? 'discard_confirm' : `discard_select_${missing_num == 1 ? '1' : 'n'}_more`, {
      n: missing_num,
    });
    return <ButtonBar click={[clickable ? () => moves.Discard() : null]} texts={[text]} />;
  }

  function renderButtonsCall() {
    if (playerStage != Stages.call_card) return;
    const all_cards: ICard[] = ['Schell', 'Gras', 'Eichel']
      .filter((col) => {
        const colorInHand = player.hand.filter((C) => C.color == CardColor[col]);
        if (colorInHand.some((C) => C.value == 14)) {
          return false;
        }
        if (colorInHand.every((C) => [11, 12].indexOf(C.value) >= 0)) {
          return false;
        }
        return true;
      })
      .map((col) => {
        return { color: CardColor[col], value: 14 };
      });
    return (
      <ButtonBar
        click={all_cards.map((C) => () => moves.Call(C))}
        question={translate('callcard_select_ace')}
        cards={all_cards}
        pattern={Pattern.Franconian}
      />
    );
  }

  function renderButtonsTrump() {
    if (playerStage != Stages.select_trump) return;
    const all_cards: ICard[] = ['Schell', 'Herz', 'Gras', 'Eichel']
      .filter((col) => {
        const colorInHand = player.hand.filter((C) => C.color == CardColor[col]);
        return colorInHand.some((C) => [11, 12].indexOf(C.value) == -1);
      })
      .map((col) => {
        return { color: CardColor[col], value: 10 };
      });
    return (
      <ButtonBar
        click={all_cards.map((C) => () => moves.SelectTrumpSuit(C.color))}
        question={translate('callcard_select_trumpsuit')}
        cards={all_cards}
        pattern={Pattern.Franconian}
      />
    );
  }

  function renderButtonsTout() {
    if (playerStage != Stages.announce_tout) return;
    return (
      <ButtonBar
        click={[() => moves.AnnounceTout(false), () => moves.AnnounceTout(true)]}
        question={translate('tout_announce_q')}
        texts={[translate('tout_announce_no'), translate('tout_announce_yes')]}
        red={[true, false]}
        noWrap={true}
      />
    );
  }

  function renderButtonsContra() {
    let canGiveContra = false;
    if (ctx.phase == Phases.placement) {
      const max_tricks = util.kittySize(ctx.numPlayers) > 0 ? 1 : 0;
      if (G.resolvedTricks.length <= max_tricks && G.trick.cards.length <= 1) {
        const isTaker = player.isTaker || player.id == G.calledTakerId;
        if (isTaker) {
          canGiveContra = G.contra == 2;
        } else {
          canGiveContra = G.contra == 1;
        }
      }
    }
    if (!canGiveContra || declinedContra) return;
    const contraType = player.isTaker || playerID == G.calledTakerId ? 'retour' : 'contra';
    return (
      <ButtonBar
        click={[() => setDeclinedContra(true), () => moves.GiveContra()]}
        question={translate(`contra_announce_${contraType}_q`)}
        texts={[translate('contra_announce_no'), translate('contra_announce_yes')]}
        red={[true, false]}
        noWrap={true}
      />
    );
  }

  function renderButtonsFinish() {
    if (player.isReady) return;
    return (
      <ButtonBar
        click={[
          () => {
            if (declinedContra) {
              setDeclinedContra(false);
            }
            moves.Finish(false);
          },
          () => moves.Finish(true),
        ]}
        texts={[translate('roundend_next'), translate('roundend_quit')]}
        red={[false, true]}
        below={true}
        noWrap={true}
      />
    );
  }

  function renderPlayerZones() {
    const currentPlayerId = showRoundSummary ? null : ctx.currentPlayer;
    const currentLeaderId = showRoundSummary ? '' : G.trick.leaderId;
    const isActive = G.players.map((P) => {
      return (!currentPlayerId && !P.isReady) || P.id === currentPlayerId;
    });
    const bids = G.players.map((P) => (P.isTaker ? G.contract : P.bid));
    const bidStrings = bids.map((bid) => (bid >= 0 ? `«${translate(util.getBidName(bid))}»` : ''));
    const biddingEnded = G.players.some((P) => P.isTaker);
    const roundEnded = currentLeaderId == '';
    const announcements = G.players.map((P) => {
      let announce: string = null;
      if (P.isTaker) {
        if (G.announcedTout || G.contra > 1) {
          announce = G.announcedTout ? translate('tout_announced') : '';
          if (G.contra > 1) {
            announce += G.announcedTout ? ' ' : '';
            announce += translate(`contra_announced_${G.contra == 2 ? 'contra' : 'retour'}`);
          }
        }
      }
      return announce;
    });
    return (
      <PlayerZones
        currentPlayerId={currentPlayerId}
        perspectivePlayerId={player.id}
        currentLeaderId={currentLeaderId}
        bids={bidStrings}
        bidPass={bids.map((bid) => bid == 0)}
        bidding={bids.map((bid) => (biddingEnded || bid < 0 ? -1 : bid == 0 ? 0 : 1))}
        announcements={announcements}
        names={playerNames}
        isActive={isActive}
        markActive={isActive.map((active) => biddingEnded && !roundEnded && active)}
        isDealer={G.players.map((P) => !roundEnded && P.isDealer)}
        isTaker={G.players.map((P) => biddingEnded && P.isTaker)}
        isOpponent={G.players.map((P) => biddingEnded && !P.isTaker)}
        isLeader={G.players.map((P) => !roundEnded && biddingEnded && P.id === currentLeaderId)}
        scores={G.players.map((P) => P.score.toString())}
        clockwise={true}
      />
    );
  }

  function renderGameOver() {
    const scores: IScore[] = G.players.map((P) => ({ playerID: P.id, score: P.score }));
    scores.sort((a, b) => b.score - a.score);
    const player = G.players.find((P) => P.id === playerID);
    const scoreboard = <Scoreboard scoreboard={scores} players={props.gameArgs.players} playerID={ctx.playerID} />;
    return (
      <GameLayout
        gameOver={player.score >= scores[0].score ? translate('gameover_you_won') : translate('gameover_you_lost')}
        extraCardContent={scoreboard}
        gameArgs={props.gameArgs}
      />
    );
  }

  function playerIndex(id: string = playerID): number {
    return ctx.playOrder.indexOf(id);
  }

  function playerName(id: string = playerID): string {
    return props.gameArgs ? props.gameArgs.players[playerIndex(id)].name : translate('player_n', { n: id });
  }

  return ctx.gameover ? renderGameOver() : renderBoard();
}

function isNone(value: number): boolean {
  return isNaN(value) || value === null;
}
