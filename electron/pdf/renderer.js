async function renderPDF(html, outputPath) {
  const puppeteer = require('puppeteer')

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    // Detect orientation from HTML
    const isLandscape = html.includes('size: A4 landscape')

    await page.pdf({
      path: outputPath,
      format: 'A4',
      landscape: isLandscape,
      printBackground: true,
      margin: isLandscape
        ? { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' }
        : { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    })
  } finally {
    await browser.close()
  }
}

module.exports = { renderPDF }
