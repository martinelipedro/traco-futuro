# Traço Futuro — classificação temporal com GRU

[**Abrir aplicativo**](https://martinelipedro.github.io/traco-futuro/) ·
[Relatório PDF](https://martinelipedro.github.io/traco-futuro/relatorio.pdf)

Reconhecimento progressivo de desenhos em uma série temporal multivariada de
amostragem irregular. O modelo usa deslocamentos, posições relativas, estado
da caneta e os intervalos de tempo originais. A inferência roda no navegador,
sem backend Python, API externa ou envio dos desenhos do usuário.

## Doze categorias

Gato, peixe, flor, casa, árvore, guarda-chuva, cachorro, tubarão, castelo, cacto,
carro e bicicleta. Você pode desenhar ou escolher um exemplo, revelar os traços
em segundos, acompanhar as hipóteses e pedir possíveis continuações.

## Resultados

São 30 mil desenhos balanceados: 24 mil de treino, 3 mil de validação e 3 mil
novos de teste. Médias de duas seeds; o aplicativo usa a seed 42.

| Observações disponíveis | Acurácia — todos | Acurácia — ainda em andamento | n em andamento |
|---|---:|---:|---:|
| Primeiros 2 s | 66,7% | 66,5% | 2.953 |
| Primeiros 4 s | 79,8% | 78,1% | 2.552 |
| Primeiros 6 s | 83,6% | 79,2% | 1.772 |
| Desenho completo | 86,7% | — | — |

Top-3 no desenho completo: 96,8%; macro-F1: 0,868. Cada janela usa somente
os eventos disponíveis até o instante de corte. "Todos" inclui desenhos que
já terminaram; o outro grupo evita confundir isso com reconhecimento precoce.

A versão anterior tinha seis categorias e outra avaliação. Seus 89,4% não são
diretamente comparáveis com este problema de doze classes e teste novo.

## Continuações: extensão experimental

- **Com referência do treino:** adapta a continuação de um exemplo conhecido.
  Pode encaixar mal ou sugerir uma forma diferente da intenção do usuário.
- **Geração livre da GRU:** amostra movimentos e estados da caneta; pode deformar
  desenhos e acumular erros. Ela não prevê durações futuras: o relógio realimentado
  usa o intervalo mediano positivo observado no prefixo.

As métricas acima medem reconhecimento, não a qualidade das continuações.
O modo por referência e a geração livre são identificados separadamente.

## Abrir e verificar localmente

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Abra http://127.0.0.1:8765. Use HTTP; abrir `index.html` diretamente pode bloquear
os módulos e o carregamento dos pesos.

Com Node.js 20 ou mais recente, sem dependências npm para instalar:

```bash
node scripts/check-site.mjs
```

A verificação confere recursos relativos, pesos, relógios, referências, PDF e
uma inferência real. Os arquivos funcionam sob o prefixo `/traco-futuro/`.

## Publicar

O workflow publica somente `dist/` a cada push em `main`. Não há instalação npm
ou treinamento no deploy. Em **Settings → Pages → Source**, use **GitHub Actions**.
Também é possível executar **Actions → Publicar Traço Futuro → Run workflow**.

Este repositório contém o aplicativo e os artefatos exportados. O relatório explica
preparação, treinamento, inicialização a partir da versão anterior e limites do
estudo. O novo teste não compartilha IDs ou hashes de geometria com desenhos usados
na versão anterior; os IDs do antigo teste também foram excluídos de todo o treino
novo. As referências pertencem somente ao treino.

Dados: Google Quick, Draw!, CC BY 4.0. Veja [DATA_ATTRIBUTION.md](DATA_ATTRIBUTION.md).
A implementação não reproduz o Sketch-RNN.
