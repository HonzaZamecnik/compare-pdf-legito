const gm = require('gm').subClass({ imageMagick: true });
const fs = require('fs-extra');
const path = require("path");
const os = require('os');

const pdfToPng = (pdfDetails, pngFilePath, config) => {
	return new Promise(async (resolve, reject) => {
		try {
			// Write the PDF buffer to a temporary file using just the base name.
			const tempDir = os.tmpdir();
			const tempPdfPath = path.join(tempDir, path.basename(pdfDetails.filename));
			await fs.writeFile(tempPdfPath, pdfDetails.buffer);

			const command = process.platform === 'win32' ? 'magick' : 'convert';
			// Ensure the output file path includes a placeholder for page index.
			let outputTemplate = pngFilePath;
			if (!outputTemplate.includes('%d')) {
				outputTemplate = pngFilePath.replace('.png', '-%d.png');
			}

			// Step 1: Convert PDF pages to PNG files without the background/flatten adjustments.
			gm(tempPdfPath)
				.command(command)
				.density(config.settings.density, config.settings.density)
				.quality(config.settings.quality)
				.write(outputTemplate, async (err) => {
					if (err) {
						await fs.remove(tempPdfPath);
						return reject(err);
					}

					try {
						// Determine the directory and base name for the generated PNGs.
						const outputDir = path.dirname(pngFilePath);
						// Get the base name (without extension) from the provided pngFilePath.
						const expectedBaseName = path.parse(pngFilePath).name;
						// List all PNG files that start with the expected base name.
						const files = await fs.readdir(outputDir);
						const pngFiles = files.filter(f => f.startsWith(expectedBaseName) && f.endsWith('.png'));

						// Step 2: Post-process each generated PNG file.
						for (const file of pngFiles) {
							const fullPath = path.join(outputDir, file);
							await new Promise((res, rej) => {
								gm(fullPath)
									.command(command)
									.background('white')
									.alpha('remove')
									.flatten()
									.write(fullPath, (error) => {
										error ? rej(error) : res();
									});
							});
						}

						// Clean up the temporary PDF.
						await fs.remove(tempPdfPath);
						resolve();
					} catch (postErr) {
						await fs.remove(tempPdfPath);
						reject(postErr);
					}
				});
		} catch (err) {
			reject(err);
		}
	});
};

const applyMask = (pngFilePath, coordinates = { x0: 0, y0: 0, x1: 0, y1: 0 }, color = 'black') => {
	return new Promise((resolve, reject) => {
		const command = process.platform === 'win32' ? 'magick' : 'convert';
		gm(pngFilePath)
			.command(command)
			.drawRectangle(coordinates.x0, coordinates.y0, coordinates.x1, coordinates.y1)
			.fill(color)
			.write(pngFilePath, (err) => {
				err ? reject(err) : resolve();
			});
	});
};

const applyCrop = (pngFilePath, coordinates = { width: 0, height: 0, x: 0, y: 0 }, index = 0) => {
	return new Promise((resolve, reject) => {
		const command = process.platform === 'win32' ? 'magick' : 'convert';
		gm(pngFilePath)
			.command(command)
			.crop(coordinates.width, coordinates.height, coordinates.x, coordinates.y)
			.write(pngFilePath.replace('.png', `-${index}.png`), (err) => {
				err ? reject(err) : resolve();
			});
	});
};

module.exports = {
	applyMask,
	applyCrop,
	pdfToPng
};