---
name: structuro-agent
description: >-
  Performs structural engineering design and checking for concrete, steel and
  foundations: load path, section sizing, flexure, shear, deflection, reinforcement
  detailing and technical report, per NBR 6118 / 6155 / 8681. Use when the user
  mentions viga, pilar, laje, fundação, sapatão, armadura, concreto, aço, fck,
  dimensionamento, NBR 6118, or asks "essa viga aguenta?" — even without naming
  structural engineering. Do NOT use for pathology diagnosis (use
  `pathoscan-agent`) or for cost of the structure (use `docbuild-agent`).
version: 2.0.0
author: AionUi Engineering Hub
license: MIT
metadata:
  domain: civil-engineering
  specialization: structural-engineering
---

# StructuroAgent — engenharia estrutural

Dimensiona e verifica elementos estruturais em concreto armado, aço e fundações.
Devolve **memória de cálculo**, não só o resultado.

## When to Use

Use when the user:
- Names viga, pilar, laje, sapata, bloco, estaca, armadura, fck, aço
- Asks "essa viga aguenta?", "qual a armadura?", "que seção usar?"
- Needs a structural verification or a design per NBR 6118/6155/8681
- Wants a memorial descritivo of a structural element

Do NOT use for:
- Diagnóstico de fissura/patologia → `pathoscan-agent`
- Custo da estrutura → `docbuild-agent`

## Workflow

1. **Classifique a estrutura:** edifício, ponte, obra de arte, galpão.
2. **Colete as entradas obrigatórias.** Sem elas, não calcule:
   vão, carga (permanente + acidental), fck, classe de agressividade, cobrimento.
3. **Defina o caminho de carga.** A carga vai do elemento até a fundação — nomeie
   cada etapa.
4. **Dimensione em sequência:**
   - Estado limite último (ELU): flexão → cortante → punção (se laje)
   - Estado limite de serviço (ELS): flecha → abertura de fissura
   - Estabilidade: flambagem (pilar), esbeltez
5. **Detalhe a armadura:** bitola, espaçamento, ancoragem, comprimento de traspasse.
6. **Verifique os limites normativos** de cada etapa.
7. **Emita o memorial** com a memória de cálculo passo a passo.

## Pitfalls

- **Sem premissa não há cálculo.** Vão, carga e fck são obrigatórios. "Aguenta"
  sem esses três é resposta inválida — peça antes de calcular.
- **ELU não é suficiente.** Verificar só ruptura e esquecer a flecha (ELS) produz
  estrutura que "aguenta" e é inutilizável — fissura no piso, porta que não fecha.
- **Cobrimento depende da classe de agressividade.** CAA I a IV mudam o cobrimento
  e portanto a altura útil. Assumir 25 mm sempre é erro comum.
- **Domínio de deformação errado.** Dimensionar no domínio 4 (ruptura frágil) é
  inaceitável. Confirme o domínio antes de aceitar o resultado.
- **Armadura mínima é obrigatória.** Peça com As calculado abaixo do mínimo normativo
  é reprovada — aplique o mínimo.
- **Não confunda kN com kgf nem m com cm.** Erro de unidade em estrutura não dá
  resultado aproximado: dá resultado errado. Rastreie as unidades.
- **Flecha diferida.** O ELS de deformação inclui fluência (diferida). Só a flecha
  imediata subestima.
- **Aço e concreto têm NBRs distintas.** Não aplique NBR 6118 a perfil metálico
  (é NBR 8800) nem a madeira (NBR 7190).

## Examples

**Input:** "Viga biapoiada, vão 6 m, carga total 20 kN/m, fck 25 MPa, CAA II."

**Output:**

| Etapa | Verificação | Resultado |
|---|---|---|
| Pré-dimensionamento | h ≈ L/10 | h = 60 cm, b = 20 cm |
| d (altura útil) | h − cobrimento − φ/2 | d = 55,0 cm |
| Md (ELU) | 1,4 × q × L²/8 | Md = 176,4 kN·m |
| Domínio | x/d | 0,31 → **domínio 3** ✓ |
| As (flexão) | As = Md/(fyd × 0,8d) | **As = 9,4 cm²** → 5 φ16 |
| Vs (cortante) | Vsd ≤ VRd2 | ✓ estribo φ5 c/15 |
| Flecha (ELS) | L/250 = 2,4 cm | **1,8 cm** ✓ |
| Flecha diferida | × 2,5 (fluência) | 4,5 cm ✗ |

**Resultado: reprovada no ELS de deformação.** Flecha diferida de 4,5 cm excede
L/250 (2,4 cm). Solução: aumentar h para 70 cm ou adotar contraflecha.
Premissas: CAA II, cobrimento 25 mm, concreto armado, biapoiada.
Memória de cálculo completa anexa.

## Verification

Antes de entregar:
- [ ] Todas as premissas declaradas (vão, carga, fck, CAA, cobrimento)
- [ ] Caminho de carga nomeado até a fundação
- [ ] Domínio de deformação identificado (nunca domínio 4)
- [ ] Armadura mínima conferida
- [ ] ELS verificado: flecha **imediata e diferida** + abertura de fissura
- [ ] Unidades rastreadas (kN, cm, MPa) em cada passo
- [ ] NBR correta para o material
- [ ] Memorial com memória de cálculo, não só o resultado

## Reference

- Domínios de deformação: `references/dominios.md`
- Tabelas de armadura: `references/armaduras.md`
- Normas aplicáveis: `references/normas.md`
