# Padrões de fissura e o que significam

## Contents
- Como ler o mapeamento
- Os 8 padrões principais
- Padrão → causa

## Como ler o mapeamento

Uma fissura isolada não é diagnóstico. O **padrão** (mapeamento) é que indica a causa:

1. **Direção:** vertical, horizontal, diagonal
2. **Localização:** meio do vão, apoio, encontro de materiais, canto de abertura
3. **Distribuição:** isolada, em malha, paralela, radial
4. **Extensão:** local, atravessa o elemento, contínua entre pavimentos

## Os 8 padrões principais

### 1. Vertical no meio do vão
```
      ↓ carga
  ┌─────────────┐
  │      ‖      │  ← fissura
  └─────────────┘
     ↑ apoio   ↑ apoio
```
**Causa:** deficiência de armadura de **flexão** ou sobrecarga.
**Risco:** ESTRUTURAL. Encaminhar para `structuro-agent`.

### 2. Diagonal junto ao apoio
```
  ┌─────────────┐
  │╲            │  ← fissura diagonal
  └─╲───────────┘
    ↑ apoio
```
**Causa:** deficiência de armadura de **cortante** (estribo insuficiente).
**Risco:** ESTRUTURAL. Crítico — ruptura frágil.

### 3. Horizontal no topo de alvenaria
```
  ═══════════════  ← fissura horizontal
  │             │
  │  alvenaria  │
```
**Causa:** movimentação **térmica** da laje ou deformação diferencial.
**Risco:** funcional (perde estanqueidade). Raramente estrutural.

### 4. Em malha / mapa
```
  ┌─┬─┬─┬─┐
  ├─┼─┼─┼─┤   ← fissuras em malha
  ├─┼─┼─┼─┤
  └─┴─┴─┴─┘
```
**Causa:** **retração** do concreto ou revestimento.
**Risco:** estético a funcional. Se com lascamento + mancha → corrosão → ESTRUTURAL.

### 5. Junto ao encontro de materiais
```
  ┌────┬────┐
  │    ‖    │  ← no encontro
  │ A  ‖  B │
  └────┴────┘
```
**Causa:** deformação **diferencial** entre os dois materiais.
**Risco:** funcional. Tratar com junta elástica, não com massa rígida.

### 6. Nos cantos de abertura
```
  ┌─────┐
  │  ╱  │  ← diagonal no canto da janela
  │ ╱   │
  └─────┘
```
**Causa:** **concentração de tensão** — falta de verga/contraverga.
**Risco:** funcional. Tratar com verga e reforço local.

### 7. Escalonada em alvenaria
```
  ┌──┐
  │  └──┐
  │     └──┐   ← escada
  └────────┘
```
**Causa:** **recalque diferencial** de fundação.
**Risco:** ESTRUTURAL. Encaminhar para `structuro-agent` — problema de solo/fundação.

### 8. Paralela à armadura (mancha + lascamento)
```
  ┌─────────────┐
  │ ▓▓▓▓▓▓▓▓▓▓ │  ← mancha de ferrugem
  └─────────────┘
```
**Causa:** **corrosão de armadura** (carbonatação, cloreto, cobrimento insuficiente).
**Risco:** ESTRUTURAL. Encaminhar — perda de seção de aço.

## Padrão → causa → risco

| Padrão | Causa provável | Risco |
|---|---|---|
| vertical meio do vão | flexão | ESTRUTURAL |
| diagonal no apoio | cortante | ESTRUTURAL (crítico) |
| horizontal topo alvenaria | térmica | funcional |
| malha / mapa | retração | estético |
| encontro de materiais | diferencial | funcional |
| canto de abertura | concentração tensão | funcional |
| escalonada | recalque | ESTRUTURAL |
| paralela + mancha | corrosão | ESTRUTURAL |

## Regra

**Direção + localização + distribuição = causa.**
Só abertura em mm não permite diagnóstico. Peça o mapeamento.
