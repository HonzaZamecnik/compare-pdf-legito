const fs = require('fs-extra');
const path = require('path');
const utils = require('./utils');
const compareData = require('./compareData');
const compareImages = require('./compareImages');

class ComparePdf {
	constructor(config = utils.copyJsonObject(require('./config'))) {
		this.config = config;
		utils.ensurePathsExist(this.config);

		this.opts = {
			masks: [],
			crops: [],
			onlyPageIndexes: [],
			skipPageIndexes: []
		};

		this.result = {
			status: 'not executed'
		};
	}

	baselinePdfBuffer(baselinePdfBuffer, baselinePdfFilename) {
		if (baselinePdfBuffer) {
			this.baselinePdfBufferData = baselinePdfBuffer;
			if (baselinePdfFilename) {
				this.baselinePdf = baselinePdfFilename;
			}
		} else {
			this.result = {
				status: 'failed',
				message: 'Baseline pdf buffer is invalid or filename is missing. Please define correctly then try again.'
			};
		}
		return this;
	}

	baselinePdfFile(baselinePdf) {
		if (baselinePdf) {
			const baselinePdfBaseName = path.parse(baselinePdf).name;
			if (fs.existsSync(baselinePdf)) {
				this.baselinePdf = baselinePdf;
			} else if (fs.existsSync(`${this.config.paths.baselinePdfRootFolder}/${baselinePdfBaseName}.pdf`)) {
				this.baselinePdf = `${this.config.paths.baselinePdfRootFolder}/${baselinePdfBaseName}.pdf`;
			} else {
				this.result = {
					status: 'failed',
					message: 'Baseline pdf file path does not exists. Please define correctly then try again.'
				};
			}
		} else {
			this.result = {
				status: 'failed',
				message: 'Baseline pdf file path was not set. Please define correctly then try again.'
			};
		}
		return this;
	}

	actualPdfBuffer(actualPdfBuffer, actualPdfFilename) {
		if (actualPdfBuffer) {
			this.actualPdfBufferData = actualPdfBuffer;
			if (actualPdfFilename) {
				this.actualPdf = actualPdfFilename;
			}
		} else {
			this.result = {
				status: 'failed',
				message: 'Actual pdf buffer is invalid or filename is missing. Please define correctly then try again.'
			};
		}
		return this;
	}

	actualPdfFile(actualPdf) {
		if (actualPdf) {
			const actualPdfBaseName = path.parse(actualPdf).name;
			if (fs.existsSync(actualPdf)) {
				this.actualPdf = actualPdf;
			} else if (fs.existsSync(`${this.config.paths.actualPdfRootFolder}/${actualPdfBaseName}.pdf`)) {
				this.actualPdf = `${this.config.paths.actualPdfRootFolder}/${actualPdfBaseName}.pdf`;
			} else {
				this.result = {
					status: 'failed',
					message: 'Actual pdf file path does not exists. Please define correctly then try again.'
				};
			}
		} else {
			this.result = {
				status: 'failed',
				message: 'Actual pdf file path was not set. Please define correctly then try again.'
			};
		}
		return this;
	}

	addMask(pageIndex, coordinates = { x0: 0, y0: 0, x1: 0, y1: 0 }, color = 'black') {
		this.opts.masks.push({
			pageIndex: pageIndex,
			coordinates: coordinates,
			color: color
		});
		return this;
	}

	addMasks(masks) {
		this.opts.masks = [...this.opts.masks, ...masks];
		return this;
	}

	onlyPageIndexes(pageIndexes) {
		this.opts.onlyPageIndexes = [...this.opts.onlyPageIndexes, ...pageIndexes];
		return this;
	}

	skipPageIndexes(pageIndexes) {
		this.opts.skipPageIndexes = [...this.opts.skipPageIndexes, ...pageIndexes];
		return this;
	}

	cropPage(pageIndex, coordinates = { width: 0, height: 0, x: 0, y: 0 }) {
		this.opts.crops.push({
			pageIndex: pageIndex,
			coordinates: coordinates
		});
		return this;
	}

	cropPages(cropPagesList) {
		this.opts.crops = [...this.opts.crops, ...cropPagesList];
		return this;
	}

	// New method: directly post-process the original exported PNGs.
	async postProcessPngs() {
		const actualPngDirPath = this.config.paths.actualPngRootFolder;
		const baselinePngDirPath = this.config.paths.baselinePngRootFolder;
		// Get the image engine based on configuration.
		const imageEngine =
			this.config.settings.imageEngine === 'graphicsMagick'
				? require('./engines/graphicsMagick')
				: require('./engines/native');

		// Get lists of all exported PNG files.
		const actualPngs = fs.readdirSync(actualPngDirPath).filter(
			(file) => file.endsWith('.png')
		);
		const baselinePngs = fs.readdirSync(baselinePngDirPath).filter(
			(file) => file.endsWith('.png')
		);

		// Process the actual PNGs in place.
		for (const file of actualPngs) {
			const filePath = path.join(actualPngDirPath, file);
			await imageEngine.postProcessPng(filePath, this.config);
		}

		// Process the baseline PNGs in place.
		for (const file of baselinePngs) {
			const filePath = path.join(baselinePngDirPath, file);
			await imageEngine.postProcessPng(filePath, this.config);
		}
	}

	// The compare() method runs the comparison then calls postProcessPngs for "byImage" comparisons.
	async compare(comparisonType = 'byImage') {
		if (this.result.status === 'not executed' || this.result.status !== 'failed') {
			const compareDetails = {
				actualPdfFilename: this.actualPdf,
				baselinePdfFilename: this.baselinePdf,
				actualPdfBuffer: this.actualPdfBufferData
					? this.actualPdfBufferData
					: fs.readFileSync(this.actualPdf),
				baselinePdfBuffer: this.baselinePdfBufferData
					? this.baselinePdfBufferData
					: fs.readFileSync(this.baselinePdf),
				config: this.config,
				opts: this.opts
			};
			switch (comparisonType) {
				case 'byBase64':
					this.result = await compareData.comparePdfByBase64(compareDetails);
					break;
				case 'byImage':
				default:
					this.result = await compareImages.comparePdfByImage(compareDetails);
					break;
			}
			// If comparing by image, run post-processing on the generated PNG files in place.
			if (comparisonType === 'byImage') {
				await this.postProcessPngs();
			}
		}
		return this.result;
	}
}

module.exports = ComparePdf;